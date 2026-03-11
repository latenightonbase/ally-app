import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rateLimit";
import { db, schema } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { generateReply, generateReplyStreaming } from "../ai/conversation";
import { AIError } from "../ai/client";
import {
  retrieveRelevantFacts,
  loadMemoryProfile,
  touchFacts,
} from "../services/retrieval";
import { enqueueExtraction } from "../services/memoryQueue";
import { resolveSession, buildSessionContext } from "../services/session";

async function prepareContext(userId: string, conversationId: string, sessionId: string, message: string) {
  const [profile, relevantFacts, sessionContext] = await Promise.all([
    loadMemoryProfile(userId),
    retrieveRelevantFacts({ userId, query: message, limit: 8 }).catch(() => []),
    buildSessionContext(userId, conversationId, sessionId),
  ]);

  const history = sessionContext.history.map((m) => ({
    role: m.role as "user" | "ally",
    content: m.content,
  }));

  return { profile, relevantFacts, history, sessionSummaries: sessionContext.sessionSummaries };
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

      const { profile, relevantFacts, history, sessionSummaries } = await prepareContext(
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
                  { message, profile, relevantFacts, conversationHistory: history, sessionSummaries, toolContext },
                  (token) => {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: "token", content: token })}\n\n`),
                    );
                  },
                );

                const messageId = await saveMessages(conversationId, sessionId, response);
                touchFacts(relevantFacts.map((f) => f.id)).catch(() => {});

                console.log(`[streaming] Full response generated for user ${user.id}, conv ${conversationId}`);

                enqueueExtraction(user.id, conversationId, message, response);

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
          toolContext,
        });

        const messageId = await saveMessages(conversationId, sessionId, response);
        touchFacts(relevantFacts.map((f) => f.id)).catch(() => {});

        enqueueExtraction(user.id, conversationId, message, response);

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
  );
