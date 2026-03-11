import { extractMemories } from "../ai/extraction";
import {
  storeExtractedFacts,
  addFollowups,
  updateProfile,
} from "./memory";
import { loadMemoryProfile } from "./retrieval";

interface PendingExtraction {
  userId: string;
  conversationId: string;
  userMessage: string;
  allyResponse: string;
  timestamp: number;
}

interface UserBatch {
  items: PendingExtraction[];
  timer: ReturnType<typeof setTimeout> | null;
}

const BATCH_SIZE = 4;
const BATCH_WINDOW_MS = 15_000;
const MAX_CONCURRENT = 2;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 2_000;

let activeExtractions = 0;
const userBatches = new Map<string, UserBatch>();
const processingQueue: (() => Promise<void>)[] = [];

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

export function enqueueExtraction(
  userId: string,
  conversationId: string,
  userMessage: string,
  allyResponse: string,
): void {
  if (!shouldExtract(userMessage, allyResponse)) {
    return;
  }

  const item: PendingExtraction = {
    userId,
    conversationId,
    userMessage,
    allyResponse,
    timestamp: Date.now(),
  };

  let batch = userBatches.get(userId);
  if (!batch) {
    batch = { items: [], timer: null };
    userBatches.set(userId, batch);
  }

  batch.items.push(item);

  if (batch.items.length >= BATCH_SIZE) {
    flushBatch(userId);
  } else if (!batch.timer) {
    batch.timer = setTimeout(() => flushBatch(userId), BATCH_WINDOW_MS);
  }
}

function flushBatch(userId: string): void {
  const batch = userBatches.get(userId);
  if (!batch || batch.items.length === 0) return;

  if (batch.timer) {
    clearTimeout(batch.timer);
    batch.timer = null;
  }

  const items = [...batch.items];
  batch.items = [];

  const task = () => processBatch(userId, items);
  processingQueue.push(task);
  drainQueue();
}

async function drainQueue(): Promise<void> {
  while (processingQueue.length > 0 && activeExtractions < MAX_CONCURRENT) {
    const task = processingQueue.shift();
    if (!task) break;

    activeExtractions++;
    task().finally(() => {
      activeExtractions--;
      drainQueue();
    });
  }
}

async function processBatch(
  userId: string,
  items: PendingExtraction[],
  attempt = 0,
): Promise<void> {
  try {
    const profile = await loadMemoryProfile(userId);

    const messages = items.flatMap((item) => [
      { role: "user" as const, content: item.userMessage, createdAt: new Date(item.timestamp).toISOString() },
      { role: "ally" as const, content: item.allyResponse, createdAt: new Date(item.timestamp).toISOString() },
    ]);

    const conversationId = items[items.length - 1].conversationId;

    const { data } = await extractMemories({
      messages,
      existingProfile: profile,
    });

    const storePromises: Promise<void>[] = [];

    if (data.facts.length > 0) {
      storePromises.push(storeExtractedFacts(userId, data.facts, conversationId));
    }

    if (data.followups?.length > 0) {
      storePromises.push(addFollowups(userId, data.followups));
    }

    if (data.profileUpdates && Object.keys(data.profileUpdates).length > 0) {
      storePromises.push(updateProfile(userId, data.profileUpdates));
    }

    await Promise.all(storePromises);
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
      return processBatch(userId, items, attempt + 1);
    }
    console.error(
      `[memory-queue] Extraction failed for user ${userId} after ${MAX_RETRIES + 1} attempts:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export function flushAllBatches(): void {
  for (const userId of userBatches.keys()) {
    flushBatch(userId);
  }
}

export function getQueueStats() {
  let pendingItems = 0;
  for (const batch of userBatches.values()) {
    pendingItems += batch.items.length;
  }
  return {
    pendingItems,
    activeExtractions,
    queuedTasks: processingQueue.length,
    trackedUsers: userBatches.size,
  };
}
