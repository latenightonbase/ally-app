import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { requireTier } from "../middleware/tierCheck";
import { db, schema } from "../db";
import { eq, and, desc } from "drizzle-orm";

export const briefingRoutes = new Elysia({ prefix: "/api/v1" })
  .use(authMiddleware)
  .use(requireTier({ requiredTiers: ["pro", "premium"], featureName: "Morning briefings" }))
  .get(
    "/briefing",
    async ({ query, user }) => {
      const date = query.date ?? new Date().toISOString().split("T")[0];

      const briefing = await db.query.briefings.findFirst({
        where: and(
          eq(schema.briefings.userId, user.id),
          eq(schema.briefings.date, date),
        ),
      });

      if (!briefing) {
        return { briefing: null };
      }

      return {
        briefing: {
          id: briefing.id,
          date: briefing.date,
          content: briefing.content,
          delivered: briefing.delivered,
          createdAt: briefing.createdAt.toISOString(),
        },
      };
    },
    {
      query: t.Object({
        date: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/briefing/history",
    async ({ query, user }) => {
      const limit = Math.min(Number(query.limit ?? 7), 30);
      const offset = Number(query.offset ?? 0);

      const briefings = await db.query.briefings.findMany({
        where: eq(schema.briefings.userId, user.id),
        orderBy: [desc(schema.briefings.date)],
        limit,
        offset,
      });

      return {
        briefings: briefings.map((b) => ({
          id: b.id,
          date: b.date,
          content: b.content,
          delivered: b.delivered,
          createdAt: b.createdAt.toISOString(),
        })),
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
  );
