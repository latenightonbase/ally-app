import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { requireTier } from "../middleware/tierCheck";
import { db, schema } from "../db";
import { eq, desc } from "drizzle-orm";

export const insightRoutes = new Elysia({ prefix: "/api/v1" })
  .use(authMiddleware)
  .use(requireTier({ requiredTiers: ["premium"], featureName: "Weekly insights" }))
  .get(
    "/insights/weekly",
    async ({ query, user }) => {
      const limit = Math.min(Number(query.limit ?? 4), 12);
      const offset = Number(query.offset ?? 0);

      const insights = await db.query.weeklyInsights.findMany({
        where: eq(schema.weeklyInsights.userId, user.id),
        orderBy: [desc(schema.weeklyInsights.createdAt)],
        limit,
        offset,
      });

      let firstDeliveredNow = false;
      if (insights.length > 0 && !insights[0].delivered) {
        await db
          .update(schema.weeklyInsights)
          .set({ delivered: true })
          .where(eq(schema.weeklyInsights.id, insights[0].id));
        firstDeliveredNow = true;
      }

      return {
        insights: insights.map((i, idx) => ({
          id: i.id,
          weekOf: i.weekOf,
          summary: i.summary,
          moodTrend: i.moodTrend,
          topThemes: i.topThemes,
          followUpSuggestions: i.followUpSuggestions,
          delivered: idx === 0 && firstDeliveredNow ? true : i.delivered,
          createdAt: i.createdAt.toISOString(),
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
