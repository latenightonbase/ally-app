import { db, schema } from "../db";
import { eq, and, desc, gte } from "drizzle-orm";
import { generateBriefing } from "../ai/briefing";
import { loadMemoryProfile } from "../services/retrieval";

export async function runDailyBriefings() {
  const today = new Date().toISOString().split("T")[0];
  console.log(`[daily-briefings] Generating briefings for ${today}`);

  const eligibleUsers = await db.query.users.findMany({
    where: and(
      eq(schema.users.tier, "pro" as any),
    ),
  });

  const premiumUsers = await db.query.users.findMany({
    where: eq(schema.users.tier, "premium" as any),
  });

  const allEligible = [...eligibleUsers, ...premiumUsers];
  console.log(`[daily-briefings] ${allEligible.length} eligible users`);

  for (const user of allEligible) {
    try {
      const existing = await db.query.briefings.findFirst({
        where: and(
          eq(schema.briefings.userId, user.id),
          eq(schema.briefings.date, today),
        ),
      });

      if (existing) continue;

      const profile = await loadMemoryProfile(user.id);
      if (!profile) continue;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentFacts = await db.query.memoryFacts.findMany({
        where: and(
          eq(schema.memoryFacts.userId, user.id),
          gte(schema.memoryFacts.createdAt, sevenDaysAgo),
        ),
        orderBy: [desc(schema.memoryFacts.createdAt)],
        limit: 20,
        columns: { content: true, category: true, createdAt: true },
      });

      const pendingFollowups = profile.pendingFollowups.filter(
        (f) => !f.resolved,
      );

      const { data } = await generateBriefing({
        profile,
        recentFacts: recentFacts.map((f) => ({
          content: f.content,
          category: f.category,
          createdAt: f.createdAt.toISOString(),
        })),
        pendingFollowups,
        date: today,
      });

      await db.insert(schema.briefings).values({
        userId: user.id,
        date: today,
        content: data.content,
      });

      console.log(`[daily-briefings] Generated for user ${user.id}`);
    } catch (err) {
      console.error(`[daily-briefings] Failed for user ${user.id}:`, err);
    }
  }

  console.log("[daily-briefings] Complete");
}
