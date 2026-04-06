import { db, schema } from "../db";
import { eq, and, lt, isNull, lte, sql } from "drizzle-orm";
import { batchDeleteMemories, batchUpdateImportance } from "../services/vectorStore";
import { storeExtractedEpisodes, expireOldFollowups } from "../services/memory";

/**
 * Daily task 1: Promote past memory_events into episodic facts.
 * An event that has passed becomes a historical episode:
 * "Interview at Stripe on March 5" → stored as episodic memory with moderate importance.
 */
async function promoteExpiredEvents(): Promise<number> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const expiredEvents = await db.query.memoryEvents.findMany({
    where: and(
      isNull(schema.memoryEvents.completedAt),
      lt(schema.memoryEvents.eventDate, yesterday),
    ),
    columns: { id: true, userId: true, content: true, eventDate: true, sourceConversationId: true },
    limit: 100,
  });

  if (expiredEvents.length === 0) return 0;

  for (const event of expiredEvents) {
    const episodicContent = `Had: ${event.content} (${event.eventDate.toDateString()})`;

    await storeExtractedEpisodes(
      event.userId,
      [
        {
          content: episodicContent,
          category: "personal_info",
          confidence: 0.9,
          importance: 0.55,
          updateType: "new",
          entities: [],
          emotion: null,
          temporal: true,
          memoryType: "episodic",
          eventDate: null,
        },
      ],
      event.sourceConversationId,
    ).catch((err) =>
      console.error(`[maintenance] Episode promotion failed for event ${event.id}: ${err.message}`),
    );

    await db
      .update(schema.memoryEvents)
      .set({ completedAt: new Date() })
      .where(eq(schema.memoryEvents.id, event.id));
  }

  console.log(`[maintenance] Promoted ${expiredEvents.length} past events to episodes`);
  return expiredEvents.length;
}

/**
 * Daily task 2: Hard-delete episodes past their TTL that were not consolidated.
 * These were low-value episodic facts that didn't form part of any pattern.
 */
async function purgeExpiredEpisodes(): Promise<number> {
  const now = new Date();

  const expiredEpisodes = await db.query.memoryEpisodes.findMany({
    where: and(
      lt(schema.memoryEpisodes.expiresAt, now),
      isNull(schema.memoryEpisodes.consolidatedAt),
    ),
    columns: { id: true },
    limit: 500,
  });

  if (expiredEpisodes.length === 0) return 0;

  const ids = expiredEpisodes.map((e) => e.id);

  await batchDeleteMemories(ids).catch((err) =>
    console.error(`[maintenance] Qdrant episode purge failed: ${err.message}`),
  );

  await db.execute(sql`
    DELETE FROM ${schema.memoryEpisodes}
    WHERE id = ANY(${ids})
      AND consolidated_at IS NULL
  `);

  console.log(`[maintenance] Purged ${ids.length} expired unconsolidated episodes`);
  return ids.length;
}

/**
 * Monthly task: Apply importance decay to semantic facts not accessed in 90+ days.
 * Keeps long-term memory from being cluttered with irrelevant stale facts.
 * Rate: 15% reduction per month of inactivity.
 * After updating Postgres, syncs the new importance values to Qdrant payloads.
 */
async function decayStaleSemanticFacts(): Promise<number> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const result = await db.execute(sql`
    UPDATE ${schema.memoryFacts}
    SET importance = GREATEST(importance * 0.85, 0.05)
    WHERE (last_accessed_at IS NULL AND created_at < ${ninetyDaysAgo})
       OR (last_accessed_at IS NOT NULL AND last_accessed_at < ${ninetyDaysAgo})
      AND superseded_by IS NULL
      AND importance > 0.05
  `);

  const count = (result as unknown as { rowCount: number }).rowCount ?? 0;
  if (count > 0) {
    console.log(`[maintenance] Applied importance decay to ${count} stale facts`);

    // Sync updated importance values to Qdrant so payload-based scoring stays accurate
    const decayedFacts = await db.query.memoryFacts.findMany({
      where: and(
        isNull(schema.memoryFacts.supersededBy),
        lt(schema.memoryFacts.createdAt, ninetyDaysAgo),
      ),
      columns: { id: true, importance: true },
      limit: 2000,
    });

    await batchUpdateImportance(
      decayedFacts.map((f) => ({ factId: f.id, importance: f.importance })),
    ).catch((err) =>
      console.error("[maintenance] Qdrant importance sync failed:", err.message),
    );
  }

  return count;
}

/**
 * Daily task 3: Expire stale unresolved follow-ups (older than 14 days).
 * Prevents ancient follow-ups from polluting daily pings indefinitely.
 */
async function expireStaleFollowups(): Promise<number> {
  // Find users who have non-null memoryProfiles (i.e., have follow-ups)
  const usersWithProfiles = await db.query.memoryProfiles.findMany({
    columns: { userId: true },
    limit: 200,
  });

  let totalExpired = 0;
  for (const { userId } of usersWithProfiles) {
    const expired = await expireOldFollowups(userId, 14).catch((err) => {
      console.error(`[maintenance] Follow-up expiry failed for ${userId}:`, err.message);
      return 0;
    });
    totalExpired += expired;
  }

  if (totalExpired > 0) {
    console.log(`[maintenance] Expired ${totalExpired} stale follow-ups across ${usersWithProfiles.length} users`);
  }
  return totalExpired;
}

export async function runDailyMaintenance(): Promise<void> {
  console.log("[maintenance] Starting daily memory maintenance");

  const [promoted, purged, expiredFollowups] = await Promise.all([
    promoteExpiredEvents().catch((err) => {
      console.error("[maintenance] Event promotion failed:", err.message);
      return 0;
    }),
    purgeExpiredEpisodes().catch((err) => {
      console.error("[maintenance] Episode purge failed:", err.message);
      return 0;
    }),
    expireStaleFollowups().catch((err) => {
      console.error("[maintenance] Follow-up expiry failed:", err.message);
      return 0;
    }),
  ]);

  console.log(`[maintenance] Daily done — promoted: ${promoted}, purged: ${purged}, followups expired: ${expiredFollowups}`);
}

export async function runMonthlyDecay(): Promise<void> {
  const today = new Date();
  if (today.getDate() !== 1) return;

  console.log("[maintenance] Running monthly importance decay");
  await decayStaleSemanticFacts().catch((err) =>
    console.error("[maintenance] Decay job failed:", err.message),
  );
}

export async function runMemoryMaintenance(): Promise<void> {
  await runDailyMaintenance();
  await runMonthlyDecay();
}
