import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { requireTier } from "../middleware/tierCheck";
import { db, schema } from "../db";
import { eq, and, desc, gte } from "drizzle-orm";
import { generateBriefing } from "../ai/briefing";
import { loadMemoryProfile } from "../services/retrieval";
import { emit } from "../services/events";

export const briefingRoutes = new Elysia({ prefix: "/api/v1" })
  .use(authMiddleware)
  .use(requireTier({ requiredTiers: ["pro", "premium"], featureName: "Morning briefings" }))
  .get(
    "/briefing",
    async ({ query, user }) => {
      const date = query.date ?? new Date().toISOString().split("T")[0];

      let briefing = await db.query.briefings.findFirst({
        where: and(
          eq(schema.briefings.userId, user.id),
          eq(schema.briefings.date, date),
        ),
      });

      if (!briefing && date === new Date().toISOString().split("T")[0]) {
        const generated = await generateOnDemandBriefing(user.id, date);
        if (generated) {
          briefing = generated;
        }
      }

      emit("user:app_opened", { userId: user.id });

      if (!briefing) {
        return { briefing: null };
      }

      if (!briefing.delivered) {
        await db.update(schema.briefings)
          .set({ delivered: true })
          .where(eq(schema.briefings.id, briefing.id));
      }

      return {
        briefing: {
          id: briefing.id,
          date: briefing.date,
          content: briefing.content,
          delivered: true,
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

async function generateOnDemandBriefing(userId: string, date: string) {
  try {
    const profile = await loadMemoryProfile(userId);
    if (!profile) return null;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentFacts = await db.query.memoryFacts.findMany({
      where: and(
        eq(schema.memoryFacts.userId, userId),
        gte(schema.memoryFacts.createdAt, sevenDaysAgo),
      ),
      orderBy: [desc(schema.memoryFacts.createdAt)],
      limit: 20,
      columns: { content: true, category: true, createdAt: true },
    });

    const pendingFollowups = profile.pendingFollowups.filter((f) => !f.resolved);

    const { data } = await generateBriefing({
      profile,
      recentFacts: recentFacts.map((f) => ({
        content: f.content,
        category: f.category,
        createdAt: f.createdAt.toISOString(),
      })),
      pendingFollowups,
      date,
    });

    const [inserted] = await db.insert(schema.briefings).values({
      userId,
      date,
      content: data.content,
    }).onConflictDoNothing().returning();

    return inserted ?? null;
  } catch (err) {
    console.error(`[briefing] On-demand generation failed for ${userId}:`, err);
    return null;
  }
}
