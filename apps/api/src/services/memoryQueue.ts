import { Queue, Worker, type Job, type ConnectionOptions } from "bullmq";
import { extractMemories } from "../ai/extraction";
import {
  storeExtractedFacts,
  storeExtractedEpisodes,
  storeExtractedEvents,
  addFollowups,
  updateProfile,
  storeEntities,
  mergeDynamicAttributes,
} from "./memory";
import { loadMemoryProfile } from "./retrieval";

interface ExtractionJobData {
  userId: string;
  conversationId: string;
  messages: { userMessage: string; allyResponse: string; timestamp: number }[];
}

const QUEUE_NAME = "memory-extraction";
const BATCH_SIZE = 4;
const BATCH_WINDOW_MS = 15_000;
const MAX_RETRIES = 2;

let _connection: ConnectionOptions | null = null;
let _queue: Queue | null = null;
let _worker: Worker | null = null;

const pendingBatches = new Map<
  string,
  { messages: ExtractionJobData["messages"]; timer: ReturnType<typeof setTimeout> | null }
>();

function getConnection(): ConnectionOptions {
  if (!_connection) {
    // REDIS_URL takes priority (dedicated Redis for BullMQ).
    // FALKORDB_URL is the graph store — it may not support Lua scripting (EVAL) required by BullMQ.
    const url = process.env.REDIS_URL ?? process.env.FALKORDB_URL;
    if (!url) throw new Error("REDIS_URL or FALKORDB_URL env var is required for the memory queue");

    const parsed = new URL(url);
    const tls = parsed.protocol === "rediss:";
    _connection = {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : tls ? 6380 : 6379,
      password: parsed.password || undefined,
      username: parsed.username || undefined,
      ...(tls ? { tls: {} } : {}),
    } as ConnectionOptions;
  }
  return _connection;
}

function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: MAX_RETRIES + 1,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }
  return _queue;
}

function shouldExtract(userMessage: string, allyResponse: string): boolean {
  const combined = `${userMessage} ${allyResponse}`.toLowerCase();
  const trivialPatterns = [
    /^(ok|okay|k|kk|sure|yes|no|nah|yep|yup|nope|cool|nice|thanks|thank you|thx|ty|lol|lmao|haha|hahaha|hmm|ah|oh|wow|brb|gtg|bye|gn|gm|hey|hi|hello|sup|yo)\.?!?$/i,
  ];

  if (userMessage.trim().length < 8 && trivialPatterns.some((p) => p.test(userMessage.trim()))) {
    return false;
  }

  const signalPatterns = [
    /\b(my|i'm|i am|i have|i got|i've|i was|i went|i feel|i think|i want|i need|i like|i love|i hate)\b/i,
    /\b(mom|dad|brother|sister|wife|husband|partner|friend|boss|colleague)\b/i,
    /\b(job|work|school|college|interview|meeting|project|deadline)\b/i,
    /\b(doctor|health|sick|anxiety|stress|therapy|workout|diet|sleep)\b/i,
    /\b(goal|plan|want to|going to|trying to|hope to|dream)\b/i,
    /\b(birthday|anniversary|wedding|holiday|vacation|trip)\b/i,
    /\b(moved|started|quit|broke up|got together|engaged|pregnant|born)\b/i,
  ];

  return signalPatterns.some((p) => p.test(combined));
}

async function flushBatch(userId: string, conversationId: string): Promise<void> {
  const pending = pendingBatches.get(userId);
  if (!pending || pending.messages.length === 0) return;

  if (pending.timer) {
    clearTimeout(pending.timer);
    pending.timer = null;
  }

  const messages = [...pending.messages];
  pending.messages = [];

  const jobData: ExtractionJobData = { userId, conversationId, messages };
  await getQueue().add("extract", jobData, { jobId: `extract:${userId}:${Date.now()}` });
}

export function enqueueExtraction(
  userId: string,
  conversationId: string,
  userMessage: string,
  allyResponse: string,
): void {
  if (!shouldExtract(userMessage, allyResponse)) return;

  let pending = pendingBatches.get(userId);
  if (!pending) {
    pending = { messages: [], timer: null };
    pendingBatches.set(userId, pending);
  }

  pending.messages.push({ userMessage, allyResponse, timestamp: Date.now() });

  if (pending.messages.length >= BATCH_SIZE) {
    flushBatch(userId, conversationId).catch((err) =>
      console.error(`[memoryQueue] Failed to flush batch for ${userId}:`, err),
    );
  } else if (!pending.timer) {
    pending.timer = setTimeout(() => {
      flushBatch(userId, conversationId).catch((err) =>
        console.error(`[memoryQueue] Timer flush failed for ${userId}:`, err),
      );
    }, BATCH_WINDOW_MS);
  }
}

export async function flushAllBatches(): Promise<void> {
  const flushPromises: Promise<void>[] = [];
  for (const userId of pendingBatches.keys()) {
    const pending = pendingBatches.get(userId);
    if (pending && pending.messages.length > 0) {
      flushPromises.push(
        flushBatch(userId, "unknown").catch((err) =>
          console.error(`[memoryQueue] flushAll failed for ${userId}:`, err),
        ),
      );
    }
  }
  await Promise.all(flushPromises);
}

async function processExtractionJob(job: Job<ExtractionJobData>): Promise<void> {
  const { userId, conversationId, messages } = job.data;

  const profile = await loadMemoryProfile(userId);

  const formattedMessages = messages.flatMap((m) => [
    { role: "user" as const, content: m.userMessage, createdAt: new Date(m.timestamp).toISOString() },
    { role: "ally" as const, content: m.allyResponse, createdAt: new Date(m.timestamp).toISOString() },
  ]);

  const { data } = await extractMemories({ messages: formattedMessages, existingProfile: profile });

  const storePromises: Promise<void>[] = [];

  const semanticFacts = data.facts.filter((f) => f.memoryType === "semantic");
  const episodicFacts = data.facts.filter((f) => f.memoryType === "episodic");
  const eventFacts = data.facts.filter((f) => f.memoryType === "event");

  if (semanticFacts.length > 0) {
    storePromises.push(storeExtractedFacts(userId, semanticFacts, conversationId));
  }
  if (episodicFacts.length > 0) {
    storePromises.push(storeExtractedEpisodes(userId, episodicFacts, conversationId));
  }
  if (eventFacts.length > 0) {
    storePromises.push(storeExtractedEvents(userId, eventFacts, conversationId));
  }
  if (data.followups?.length > 0) {
    storePromises.push(addFollowups(userId, data.followups));
  }
  if (data.profileUpdates && Object.keys(data.profileUpdates).length > 0) {
    storePromises.push(updateProfile(userId, data.profileUpdates));
  }

  await Promise.all(storePromises);

  if (data.dynamicAttributes && Object.keys(data.dynamicAttributes).length > 0) {
    await mergeDynamicAttributes(userId, data.dynamicAttributes, conversationId).catch((err) =>
      console.error(`[memoryQueue] Dynamic attribute merge failed for ${userId}:`, err),
    );
  }

  if (data.entities && data.entities.length > 0) {
    const allStoredIds = [
      ...semanticFacts.map((_, i) => `pending-${i}`),
      ...episodicFacts.map((_, i) => `pending-ep-${i}`),
    ];
    await storeEntities(userId, data.entities, allStoredIds).catch((err) =>
      console.error(`[memoryQueue] Entity storage failed for ${userId}:`, err),
    );
  }
}

/**
 * Start the BullMQ worker. Call once during server startup.
 * The worker runs in the same process (sufficient for single-instance);
 * extract to a separate process for horizontal scaling.
 */
export function startMemoryWorker(): Worker {
  if (_worker) return _worker;

  _worker = new Worker(QUEUE_NAME, processExtractionJob, {
    connection: getConnection(),
    concurrency: 2,
  });

  _worker.on("failed", (job, err) => {
    console.error(
      `[memoryQueue] Job ${job?.id} failed after ${job?.attemptsMade} attempts: ${err.message}`,
    );
  });

  _worker.on("completed", (job) => {
    console.log(`[memoryQueue] Job ${job.id} completed for user ${job.data.userId}`);
  });

  console.log("[memoryQueue] BullMQ worker started");
  return _worker;
}

export function getQueueStats() {
  let pendingItems = 0;
  for (const batch of pendingBatches.values()) {
    pendingItems += batch.messages.length;
  }
  return {
    pendingItems,
    trackedUsers: pendingBatches.size,
  };
}
