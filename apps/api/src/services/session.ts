import { db, schema } from "../db";
import { eq, and, desc, isNull, sql, gte, lte, count } from "drizzle-orm";
import { callClaude } from "../ai/client";
import type { MemoryProfile, MemoryFact } from "@ally/shared";

const SESSION_GAP_MS = 30 * 60 * 1000;
const MAX_ACTIVE_SESSION_MESSAGES = 12;
/** Force-rotate session once it exceeds this many messages to prevent context blowup. */
const MAX_SESSION_MESSAGES_BEFORE_ROTATE = 40;

interface SessionSummary {
  sessionId: string;
  summary: string;
  startedAt: string;
}

export async function resolveSession(
  userId: string,
  conversationId: string,
): Promise<string> {
  const activeSession = await db.query.sessions.findFirst({
    where: and(
      eq(schema.sessions.conversationId, conversationId),
      isNull(schema.sessions.endedAt),
    ),
    orderBy: [desc(schema.sessions.startedAt)],
  });

  if (activeSession) {
    const lastMessage = await db.query.messages.findFirst({
      where: eq(schema.messages.sessionId, activeSession.id),
      orderBy: [desc(schema.messages.createdAt)],
      columns: { createdAt: true },
    });

    const gap = lastMessage
      ? Date.now() - lastMessage.createdAt.getTime()
      : Infinity;

    if (gap < SESSION_GAP_MS) {
      // Auto-rotate if session has grown too large
      const msgCount = await db
        .select({ value: count() })
        .from(schema.messages)
        .where(eq(schema.messages.sessionId, activeSession.id));
      if (Number(msgCount[0]?.value ?? 0) >= MAX_SESSION_MESSAGES_BEFORE_ROTATE) {
        await closeSession(activeSession.id);
      } else {
        return activeSession.id;
      }
    } else {
      await closeSession(activeSession.id);
    }
  }

  const [newSession] = await db
    .insert(schema.sessions)
    .values({ conversationId, userId })
    .returning({ id: schema.sessions.id });

  return newSession.id;
}

async function closeSession(sessionId: string): Promise<void> {
  const messages = await db.query.messages.findMany({
    where: eq(schema.messages.sessionId, sessionId),
    orderBy: [schema.messages.createdAt],
    columns: { role: true, content: true },
    limit: 30,
  });

  if (messages.length < 3) {
    await db
      .update(schema.sessions)
      .set({ endedAt: new Date(), messageCount: messages.length })
      .where(eq(schema.sessions.id, sessionId));
    return;
  }

  const conversationText = messages
    .map((m) => `${m.role === "user" ? "User" : "Anzi"}: ${m.content}`)
    .join("\n");

  try {
    const { text } = await callClaude({
      system: `Summarize this conversation session in 2-3 sentences. Focus on: what the user talked about, their emotional state, any decisions or plans made, and unresolved topics. Write in third person ("The user discussed..."). Be concise.`,
      messages: [{ role: "user", content: conversationText }],
      maxTokens: 200,
    });

    const tokenEstimate = Math.ceil(conversationText.length / 4);

    await db
      .update(schema.sessions)
      .set({
        summary: text,
        endedAt: new Date(),
        messageCount: messages.length,
        tokenEstimate,
      })
      .where(eq(schema.sessions.id, sessionId));
  } catch {
    await db
      .update(schema.sessions)
      .set({ endedAt: new Date(), messageCount: messages.length })
      .where(eq(schema.sessions.id, sessionId));
  }
}

/**
 * Fetch upcoming events within the next N days for proactive context injection.
 */
async function getUpcomingEvents(userId: string, daysAhead: number): Promise<string> {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(now.getDate() + daysAhead);

  const events = await db.query.memoryEvents.findMany({
    where: and(
      eq(schema.memoryEvents.userId, userId),
      isNull(schema.memoryEvents.completedAt),
      gte(schema.memoryEvents.eventDate, now),
      lte(schema.memoryEvents.eventDate, cutoff),
    ),
    orderBy: [schema.memoryEvents.eventDate],
    limit: 5,
    columns: { content: true, eventDate: true },
  });

  if (events.length === 0) return "";

  return events
    .map((e) => {
      const label = getRelativeTime(e.eventDate);
      return `[${label}] ${e.content}`;
    })
    .join("\n");
}

/**
 * Build context from session summaries + active session messages + upcoming events.
 */
export async function buildSessionContext(
  userId: string,
  conversationId: string,
  activeSessionId: string,
): Promise<{
  history: { role: string; content: string }[];
  sessionSummaries: string;
  sessionCount: number;
}> {
  const [recentSessions, activeMessages, upcomingEventsText, sessionCountResult] = await Promise.all([
    db.query.sessions.findMany({
      where: and(
        eq(schema.sessions.userId, userId),
        sql`${schema.sessions.summary} IS NOT NULL`,
        sql`${schema.sessions.id} != ${activeSessionId}`,
      ),
      orderBy: [desc(schema.sessions.startedAt)],
      limit: 3,
      columns: { summary: true, startedAt: true },
    }),

    db.query.messages.findMany({
      where: eq(schema.messages.sessionId, activeSessionId),
      orderBy: [schema.messages.createdAt],
      limit: MAX_ACTIVE_SESSION_MESSAGES,
      columns: { role: true, content: true },
    }),

    getUpcomingEvents(userId, 7),

    db.select({ value: count() }).from(schema.sessions).where(eq(schema.sessions.userId, userId)),
  ]);

  let sessionSummaries = "";

  if (upcomingEventsText) {
    sessionSummaries += `**Upcoming events:**\n${upcomingEventsText}\n\n`;
  }

  if (recentSessions.length > 0) {
    sessionSummaries += recentSessions
      .reverse()
      .map((s) => {
        const timeAgo = getRelativeTime(s.startedAt);
        return `[${timeAgo}] ${s.summary}`;
      })
      .join("\n");
  }

  const history = activeMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const sessionCount = Number(sessionCountResult[0]?.value ?? 0);

  return { history, sessionSummaries, sessionCount };
}

function getRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return "just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}
