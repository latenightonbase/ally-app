import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rateLimit";
import { db, schema } from "../db";
import { eq, and, sql, desc } from "drizzle-orm";
import { generateReply, generateReplyStreaming } from "../ai/conversation";
import { AIError, estimateTokens, MAX_CONTEXT_TOKENS } from "../ai/client";
import {
  retrieveRelevantFacts,
  loadMemoryProfile,
} from "../services/retrieval";
import { enqueueExtraction } from "../services/memoryQueue";
import { resolveSession, buildSessionContext } from "../services/session";
import { getPendingReminders, dismissReminder } from "../services/reminderService";

/**
 * Emit a structured log line for implicit conversation quality signals.
 * These feed the fine-tuning pipeline: session_depth + response_ms are
 * revealed-preference signals that don't require user action.
 * Pipe stdout to a log aggregator (Axiom, Datadog, etc.) to query them.
 */
async function logConversationSignal(
  userId: string,
  conversationId: string,
  sessionId: string,
  sessionCount: number,
  responseMs: number,
): Promise<void> {
  try {
    const [turnCountResult, lastAllyMsg] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.messages)
        .where(eq(schema.messages.sessionId, sessionId)),
      db.query.messages.findFirst({
        where: and(
          eq(schema.messages.sessionId, sessionId),
          eq(schema.messages.role, "ally"),
        ),
        orderBy: [desc(schema.messages.createdAt)],
        columns: { createdAt: true },
      }),
    ]);

    const sessionDepth = Number(turnCountResult[0]?.count ?? 0);
    const userResponseMs = lastAllyMsg
      ? Date.now() - lastAllyMsg.createdAt.getTime()
      : null;

    console.log(
      JSON.stringify({
        event: "conversation_signal",
        userId,
        conversationId,
        sessionId,
        sessionCount,
        sessionDepth,
        responseMs,
        userResponseMs,
        ts: new Date().toISOString(),
      }),
    );
  } catch {
    // Signal logging is best-effort — never let it affect the user experience
  }
}

async function prepareContext(userId: string, conversationId: string, sessionId: string, message: string) {
  const [profile, relevantFacts, sessionContext] = await Promise.all([
    loadMemoryProfile(userId),
    retrieveRelevantFacts({ userId, query: message, limit: 5 }).catch(() => []),
    buildSessionContext(userId, conversationId, sessionId),
  ]);

  let history = sessionContext.history.slice(-12).map((m) => ({
    role: m.role as "user" | "ally",
    content: m.content,
  }));

  // Token budget guard: if history is too large, aggressively trim older messages
  let historyTokens = history.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  while (history.length > 4 && historyTokens > 30_000) {
    history = history.slice(1);
    historyTokens = history.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  }

  return {
    profile,
    relevantFacts,
    history,
    sessionSummaries: sessionContext.sessionSummaries,
    sessionCount: sessionContext.sessionCount,
  };
}

async function ensureConversation(userId: string, message: string, existingId?: string) {
  if (existingId) return existingId;

  const [conv] = await db
    .insert(schema.conversations)
    .values({ userId, preview: message.slice(0, 100) })
    .returning({ id: schema.conversations.id });
  return conv.id;
}

async function saveMessages(conversationId: string, sessionId: string, allyResponse: string) {
  const [allyMsg] = await db
    .insert(schema.messages)
    .values({ conversationId, sessionId, role: "ally", content: allyResponse })
    .returning({ id: schema.messages.id });

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId));

  await db
    .update(schema.conversations)
    .set({ lastMessageAt: new Date(), messageCount: Number(countResult[0].count) })
    .where(eq(schema.conversations.id, conversationId));

  return allyMsg.id;
}

export const chatRoutes = new Elysia({ prefix: "/api/v1" })
  .use(authMiddleware)
  .use(rateLimitMiddleware)
  .post(
    "/chat",
    async ({ body, user, set, ...ctx }) => {
      const rateLimit = (ctx as any).rateLimit;
      rateLimit?.checkMessageLimit();

      const { message, conversationId: existingConvId, stream } = body;

      const conversationId = await ensureConversation(user.id, message, existingConvId);
      const sessionId = await resolveSession(user.id, conversationId);

      await db.insert(schema.messages).values({
        conversationId,
        sessionId,
        role: "user",
        content: message,
      });

      const { profile, relevantFacts, history, sessionSummaries, sessionCount } = await prepareContext(
        user.id,
        conversationId,
        sessionId,
        message,
      );

      const toolContext = {
        userId: user.id,
        conversationId,
        timezone: profile?.personalInfo?.other?.timezone as string | undefined,
        location: profile?.personalInfo?.location
          ? { city: profile.personalInfo.location }
          : undefined,
      };

      const requestStart = Date.now();

      try {
        if (stream) {
          set.headers["content-type"] = "text/event-stream";
          set.headers["cache-control"] = "no-cache";
          set.headers["connection"] = "keep-alive";

          const encoder = new TextEncoder();
          const readable = new ReadableStream({
            async start(controller) {
              try {
                const { response } = await generateReplyStreaming(
                  { message, profile, relevantFacts, conversationHistory: history, sessionSummaries, sessionCount, toolContext },
                  (token) => {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: "token", content: token })}\n\n`),
                    );
                  },
                );

                const messageId = await saveMessages(conversationId, sessionId, response);

                enqueueExtraction(user.id, conversationId, message, response);
                logConversationSignal(user.id, conversationId, sessionId, sessionCount, Date.now() - requestStart);

                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "done",
                      conversationId,
                      messageId,
                      fullResponse: response,
                    })}\n\n`,
                  ),
                );
                controller.close();
              } catch (err) {
                const errMsg =
                  err instanceof Error ? err.message : "Stream failed";
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "error", message: errMsg })}\n\n`,
                  ),
                );
                controller.close();
              }
            },
          });

          return new Response(readable);
        }

        const { response } = await generateReply({
          message,
          profile,
          relevantFacts,
          conversationHistory: history,
          sessionSummaries,
          sessionCount,
          toolContext,
        });

        const messageId = await saveMessages(conversationId, sessionId, response);

        enqueueExtraction(user.id, conversationId, message, response);
        logConversationSignal(user.id, conversationId, sessionId, sessionCount, Date.now() - requestStart);

        return { response, conversationId, messageId };
      } catch (e) {
        if (e instanceof AIError) {
          set.status = e.statusCode;
          throw new Error(e.message);
        }
        throw e;
      }
    },
    {
      body: t.Object({
        message: t.String(),
        conversationId: t.Optional(t.String()),
        stream: t.Optional(t.Boolean()),
      }),
    },
  )
  .post(
    "/chat/feedback",
    async ({ body, user }) => {
      const { messageId, feedback } = body;

      const [updated] = await db
        .update(schema.messages)
        .set({ feedback })
        .where(
          and(
            eq(schema.messages.id, messageId),
            eq(schema.messages.role, "ally"),
          ),
        )
        .returning({ id: schema.messages.id });

      return { success: !!updated };
    },
    {
      body: t.Object({
        messageId: t.String(),
        feedback: t.Integer({ minimum: -1, maximum: 1 }),
      }),
    },
  )
  .get(
    "/reminders",
    async ({ user }) => {
      const reminders = await getPendingReminders(user.id, 20);
      return { reminders };
    },
  )
  .post(
    "/reminders/:id/dismiss",
    async ({ params, user }) => {
      const success = await dismissReminder(user.id, params.id);
      return { success };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    },
  );
