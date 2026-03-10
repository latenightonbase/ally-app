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
import { extractMemories } from "../ai/extraction";
import {
  storeExtractedFacts,
  addFollowups,
  updateProfile,
} from "../services/memory";

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

/**
 * Fire-and-forget inline memory extraction after each chat exchange.
 * Runs asynchronously so it doesn't block the response to the user.
 * Extracts facts from the user message + ally response, stores them
 * with embeddings, and updates the memory profile.
 */
async function extractMemoriesInline(
  userId: string,
  conversationId: string,
  userMessage: string,
  allyResponse: string,
) {
  try {
    console.log(`[inline-extraction] Starting for user ${userId}, conv ${conversationId}`);
    const profile = await loadMemoryProfile(userId);
    console.log(`[inline-extraction] Profile loaded: ${profile ? "exists" : "null (new user)"}`);

    const { data } = await extractMemories({
      messages: [
        { role: "user" as const, content: userMessage, createdAt: new Date().toISOString() },
        { role: "ally" as const, content: allyResponse, createdAt: new Date().toISOString() },
      ],
      existingProfile: profile,
    });

    console.log(
      `[inline-extraction] Claude returned: ${data.facts.length} facts, ` +
      `${data.followups?.length ?? 0} followups, ` +
      `profileUpdates keys: ${data.profileUpdates ? Object.keys(data.profileUpdates).join(",") : "none"}`,
    );

    if (data.facts.length > 0) {
      const highConfidence = data.facts.filter((f) => f.confidence >= 0.7);
      console.log(
        `[inline-extraction] Facts confidence breakdown: ` +
        data.facts.map((f) => `"${f.content.slice(0, 40)}" (conf=${f.confidence})`).join("; "),
      );
      console.log(
        `[inline-extraction] ${highConfidence.length}/${data.facts.length} facts pass confidence >= 0.7 filter`,
      );
      await storeExtractedFacts(userId, data.facts, conversationId);
      console.log(`[inline-extraction] User ${userId}: stored ${highConfidence.length} facts`);
    } else {
      console.log(`[inline-extraction] No facts extracted from this exchange`);
    }

    if (data.followups && data.followups.length > 0) {
      await addFollowups(userId, data.followups);
      console.log(`[inline-extraction] Added ${data.followups.length} followups`);
    }

    if (data.profileUpdates && Object.keys(data.profileUpdates).length > 0) {
      await updateProfile(userId, data.profileUpdates);
      console.log(`[inline-extraction] Profile updated with keys: ${Object.keys(data.profileUpdates).join(", ")}`);
    }
  } catch (err) {
    // Log but don't throw — extraction failure should never break chat
    console.error(
      `[inline-extraction] FAILED for user ${userId}:`,
      err instanceof Error ? `${err.message}\n${err.stack}` : err,
    );
  }
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

                console.log(`[streaming] Full response generated for user ${user.id}, conv ${conversationId}`);

                // Fire-and-forget: extract memories from this exchange
                extractMemoriesInline(user.id, conversationId, message, response).catch(() => {});

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

        // Fire-and-forget: extract memories from this exchange
        extractMemoriesInline(user.id, conversationId, message, response).catch(() => {});

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
