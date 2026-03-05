import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { db, schema } from "../db";
import { eq, and, desc, lt, sql } from "drizzle-orm";

export const conversationRoutes = new Elysia({ prefix: "/api/v1" })
  .use(authMiddleware)
  .get(
    "/conversations",
    async ({ query, user }) => {
      const limit = Math.min(Number(query.limit ?? 10), 50);
      const offset = Number(query.offset ?? 0);

      const [conversations, countResult] = await Promise.all([
        db.query.conversations.findMany({
          where: eq(schema.conversations.userId, user.id),
          orderBy: [desc(schema.conversations.lastMessageAt)],
          limit,
          offset,
        }),
        db
          .select({ count: sql<number>`count(*)` })
          .from(schema.conversations)
          .where(eq(schema.conversations.userId, user.id)),
      ]);

      return {
        conversations: conversations.map((c) => ({
          id: c.id,
          preview: c.preview,
          messageCount: c.messageCount,
          createdAt: c.createdAt.toISOString(),
          lastMessageAt: c.lastMessageAt.toISOString(),
        })),
        total: Number(countResult[0].count),
        limit,
        offset,
      };
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/conversations/:conversationId",
    async ({ params, query, user, set }) => {
      const conv = await db.query.conversations.findFirst({
        where: and(
          eq(schema.conversations.id, params.conversationId),
          eq(schema.conversations.userId, user.id),
        ),
      });

      if (!conv) {
        set.status = 404;
        return { error: { code: "NOT_FOUND", message: "Conversation not found", status: 404 } };
      }

      const limit = Math.min(Number(query.limit ?? 50), 200);
      const conditions = [
        eq(schema.messages.conversationId, params.conversationId),
      ];

      if (query.before) {
        const beforeMsg = await db.query.messages.findFirst({
          where: eq(schema.messages.id, query.before),
          columns: { createdAt: true },
        });
        if (beforeMsg) {
          conditions.push(lt(schema.messages.createdAt, beforeMsg.createdAt));
        }
      }

      const messages = await db.query.messages.findMany({
        where: and(...conditions),
        orderBy: [desc(schema.messages.createdAt)],
        limit: limit + 1,
      });

      const hasMore = messages.length > limit;
      const resultMessages = messages.slice(0, limit).reverse();

      return {
        conversationId: params.conversationId,
        messages: resultMessages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
        hasMore,
      };
    },
    {
      params: t.Object({
        conversationId: t.String(),
      }),
      query: t.Object({
        limit: t.Optional(t.String()),
        before: t.Optional(t.String()),
      }),
    },
  );
