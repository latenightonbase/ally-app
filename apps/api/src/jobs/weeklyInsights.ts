import { db, schema } from "../db";
import { eq, and, gte } from "drizzle-orm";
import { callClaudeStructured } from "../ai/client";
import { loadMemoryProfile } from "../services/retrieval";
import { sendPushNotification } from "../services/notifications";
import type { WeeklyInsight } from "@ally/shared";

export async function runWeeklyInsights() {
  console.log("[weekly-insights] Starting...");

  const premiumUsers = await db.query.user.findMany({
    where: eq(schema.user.tier, "premium"),
    columns: { id: true, expoPushToken: true, allyName: true },
  });

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekOf = weekAgo.toISOString().split("T")[0];

  for (const user of premiumUsers) {
    try {
      const existing = await db.query.weeklyInsights.findFirst({
        where: and(
          eq(schema.weeklyInsights.userId, user.id),
          eq(schema.weeklyInsights.weekOf, weekOf),
        ),
        columns: { id: true },
      });
      if (existing) continue;

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
        .orderBy(schema.messages.createdAt)
        .limit(100);

      if (weekMessages.length === 0) continue;

      const MAX_CONVERSATION_CHARS = 50_000;
      let conversationText = weekMessages
        .map((m) => `[${m.role}] ${m.content}`)
        .join("\n");
      if (conversationText.length > MAX_CONVERSATION_CHARS) {
        conversationText = conversationText.slice(-MAX_CONVERSATION_CHARS);
      }

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

      await db
        .insert(schema.weeklyInsights)
        .values({
          userId: user.id,
          weekOf: data.weekOf ?? weekOf,
          summary: data.summary,
          moodTrend: data.moodTrend,
          topThemes: data.topThemes ?? [],
          followUpSuggestions: data.followUpSuggestions ?? [],
        })
        .onConflictDoNothing();

      if (user.expoPushToken) {
        const allyName = user.allyName ?? "Anzi";
        await sendPushNotification(
          user.expoPushToken,
          `${allyName} has your weekly reflection`,
          "Your week in review is ready. Tap to see how your week looked.",
          { type: "weekly_insight", weekOf },
        ).catch((err) => {
          console.warn(`[weekly-insights] Push failed for ${user.id}:`, err);
        });
      }

      console.log(`[weekly-insights] Generated for user ${user.id}`);
    } catch (err) {
      console.error(`[weekly-insights] Failed for user ${user.id}:`, err);
    }
  }

  console.log("[weekly-insights] Complete");
}
