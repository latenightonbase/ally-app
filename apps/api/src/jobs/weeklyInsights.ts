import { db, schema } from "../db";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { callClaudeStructured } from "../ai/client";
import { loadMemoryProfile } from "../services/retrieval";
import type { WeeklyInsight } from "@ally/shared";

export async function runWeeklyInsights() {
  console.log("[weekly-insights] Starting...");

  const premiumUsers = await db.query.users.findMany({
    where: eq(schema.users.tier, "premium" as any),
  });

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekOf = weekAgo.toISOString().split("T")[0];

  for (const user of premiumUsers) {
    try {
      const profile = await loadMemoryProfile(user.id);
      if (!profile) continue;

      const weekMessages = await db
        .select({
          role: schema.messages.role,
          content: schema.messages.content,
          createdAt: schema.messages.createdAt,
        })
        .from(schema.messages)
        .innerJoin(
          schema.conversations,
          eq(schema.messages.conversationId, schema.conversations.id),
        )
        .where(
          and(
            eq(schema.conversations.userId, user.id),
            gte(schema.messages.createdAt, weekAgo),
          ),
        )
        .orderBy(schema.messages.createdAt);

      if (weekMessages.length === 0) continue;

      const conversationText = weekMessages
        .map((m) => `[${m.role}] ${m.content}`)
        .join("\n");

      const { data } = await callClaudeStructured<WeeklyInsight>({
        system: `You are generating a weekly emotional insight report for a personal AI companion.
Analyze this week's conversations and provide a warm, personal summary of the user's emotional week.
Return as JSON: { "weekOf": "${weekOf}", "summary": "...", "moodTrend": "improving|declining|stable|mixed", "topThemes": [...], "followUpSuggestions": [...] }`,
        messages: [
          {
            role: "user",
            content: `User: ${profile.personalInfo.preferredName ?? "User"}\n\nThis week's conversations:\n${conversationText}`,
          },
        ],
        maxTokens: 1024,
      });

      await db.insert(schema.jobRuns).values({
        jobName: "weekly_insights",
        userId: user.id,
        status: "completed",
        completedAt: new Date(),
        metadata: { insight: data },
      });

      console.log(`[weekly-insights] Generated for user ${user.id}`);
    } catch (err) {
      console.error(`[weekly-insights] Failed for user ${user.id}:`, err);
    }
  }

  console.log("[weekly-insights] Complete");
}
