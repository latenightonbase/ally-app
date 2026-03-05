import { db, schema } from "../db";
import { eq, and, gte, sql } from "drizzle-orm";
import { extractMemories } from "../ai/extraction";
import { storeExtractedFacts, addFollowups, updateProfile } from "../services/memory";
import { loadMemoryProfile } from "../services/retrieval";

export async function runNightlyExtraction() {
  console.log("[nightly-extraction] Starting...");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const activeUsers = await db
    .selectDistinct({ userId: schema.conversations.userId })
    .from(schema.conversations)
    .where(gte(schema.conversations.lastMessageAt, todayStart));

  console.log(
    `[nightly-extraction] Found ${activeUsers.length} users with conversations today`,
  );

  for (const { userId } of activeUsers) {
    try {
      const [jobRun] = await db
        .insert(schema.jobRuns)
        .values({ jobName: "nightly_extraction", userId, status: "running" })
        .returning({ id: schema.jobRuns.id });

      const todaysConversations = await db.query.conversations.findMany({
        where: and(
          eq(schema.conversations.userId, userId),
          gte(schema.conversations.lastMessageAt, todayStart),
        ),
      });

      const allMessages = [];
      for (const conv of todaysConversations) {
        const messages = await db.query.messages.findMany({
          where: eq(schema.messages.conversationId, conv.id),
          orderBy: [schema.messages.createdAt],
        });
        allMessages.push(...messages);
      }

      if (allMessages.length === 0) continue;

      const profile = await loadMemoryProfile(userId);
      const { data, tokensUsed } = await extractMemories({
        messages: allMessages.map((m) => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
        existingProfile: profile,
      });

      const sourceConvId =
        todaysConversations.length > 0 ? todaysConversations[0].id : null;

      await storeExtractedFacts(userId, data.facts, sourceConvId);
      await addFollowups(userId, data.followups);

      if (data.profileUpdates && Object.keys(data.profileUpdates).length > 0) {
        await updateProfile(userId, data.profileUpdates);
      }

      await db
        .update(schema.jobRuns)
        .set({
          status: "completed",
          completedAt: new Date(),
          metadata: {
            factsExtracted: data.facts.length,
            followupsDetected: data.followups.length,
            tokensUsed,
          },
        })
        .where(eq(schema.jobRuns.id, jobRun.id));

      console.log(
        `[nightly-extraction] User ${userId}: ${data.facts.length} facts, ${data.followups.length} followups`,
      );
    } catch (err) {
      console.error(`[nightly-extraction] Failed for user ${userId}:`, err);
    }
  }

  console.log("[nightly-extraction] Complete");
}
