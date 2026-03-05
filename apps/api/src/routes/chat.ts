import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rateLimit";
import { db, schema } from "../db";
import { eq, sql } from "drizzle-orm";
import { generateReply, generateReplyStreaming } from "../ai/conversation";
import { AIError } from "../ai/client";
import {
  retrieveRelevantFacts,
  loadMemoryProfile,
  loadRecentHistory,
  touchFacts,
} from "../services/retrieval";

async function prepareContext(userId: string, conversationId: string, message: string) {
  const [profile, relevantFacts, recentMessages] = await Promise.all([
    loadMemoryProfile(userId),
    retrieveRelevantFacts({ userId, query: message, limit: 8 }).catch(() => []),
    loadRecentHistory(conversationId, 20),
  ]);

  const history = recentMessages
    .reverse()
    .map((m) => ({ role: m.role, content: m.content }));

  return { profile, relevantFacts, history };
}

async function ensureConversation(userId: string, message: string, existingId?: string) {
  if (existingId) return existingId;

  const [conv] = await db
    .insert(schema.conversations)
    .values({ userId, preview: message.slice(0, 100) })
    .returning({ id: schema.conversations.id });
  return conv.id;
}

async function saveMessages(conversationId: string, userMessage: string, allyResponse: string) {
  const [allyMsg] = await db
    .insert(schema.messages)
    .values({ conversationId, role: "ally", content: allyResponse })
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

      await db.insert(schema.messages).values({
        conversationId,
        role: "user",
        content: message,
      });

      const { profile, relevantFacts, history } = await prepareContext(
        user.id,
        conversationId,
        message,
      );

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
                  { message, profile, relevantFacts, conversationHistory: history },
                  (token) => {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: "token", content: token })}\n\n`),
                    );
                  },
                );

                const messageId = await saveMessages(conversationId, message, response);
                touchFacts(relevantFacts.map((f) => f.id)).catch(() => {});

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
        });

        const messageId = await saveMessages(conversationId, message, response);
        touchFacts(relevantFacts.map((f) => f.id)).catch(() => {});

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
  );
