import { db, schema } from "../db";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { callClaude } from "../ai/client";
import type { MemoryProfile, MemoryFact } from "@ally/shared";

const SESSION_GAP_MS = 30 * 60 * 1000;
const MAX_ACTIVE_SESSION_MESSAGES = 30;

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
      return activeSession.id;
    }

    await closeSession(activeSession.id);
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
  });

  if (messages.length < 3) {
    await db
      .update(schema.sessions)
      .set({ endedAt: new Date(), messageCount: messages.length })
      .where(eq(schema.sessions.id, sessionId));
    return;
  }

  const conversationText = messages
    .map((m) => `${m.role === "user" ? "User" : "Ally"}: ${m.content}`)
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
 * Build context from session summaries + active session messages.
 * Replaces the old "load last 20 messages" approach.
 */
export async function buildSessionContext(
  userId: string,
  conversationId: string,
  activeSessionId: string,
): Promise<{
  history: { role: string; content: string }[];
  sessionSummaries: string;
}> {
  const [recentSessions, activeMessages] = await Promise.all([
    db.query.sessions.findMany({
      where: and(
        eq(schema.sessions.userId, userId),
        sql`${schema.sessions.summary} IS NOT NULL`,
        sql`${schema.sessions.id} != ${activeSessionId}`,
      ),
      orderBy: [desc(schema.sessions.startedAt)],
      limit: 5,
      columns: { summary: true, startedAt: true },
    }),

    db.query.messages.findMany({
      where: eq(schema.messages.sessionId, activeSessionId),
      orderBy: [schema.messages.createdAt],
      limit: MAX_ACTIVE_SESSION_MESSAGES,
      columns: { role: true, content: true },
    }),
  ]);

  let sessionSummaries = "";
  if (recentSessions.length > 0) {
    sessionSummaries = recentSessions
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

  return { history, sessionSummaries };
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
