/**
 * nightly_extraction.js — Memory extraction for Ally
 *
 * Runs once per night (default 23:00). For each user it collects the day's
 * conversations, sends them to the Python memory-extraction pipeline via
 * python-bridge, and merges the extracted facts back into the user's
 * memory profile.
 *
 * Standalone:  node cron/nightly_extraction.js
 *
 * Production integration:
 *   - Bull / BullMQ:  queue.add({}, { repeat: { cron: '0 23 * * *' } })
 *   - Agenda:         agenda.every('0 23 * * *', 'nightly-extraction')
 *   - Cloud cron:     AWS EventBridge / GCP Cloud Scheduler at 23:00 UTC
 *   - node-cron:      cron.schedule('0 23 * * *', run)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const path = require('path');
const memoryService = require(path.resolve(__dirname, '..', 'backend', 'services', 'memory'));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const EXTRACTION_HOUR = parseInt(process.env.EXTRACTION_HOUR || '23', 10);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get today's date string in YYYY-MM-DD format.
 */
function todayString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Call the Python memory_extraction pipeline for a single user.
 * Returns an object with extracted facts.
 */
async function extractMemories(userId, conversations) {
  const pythonBridge = require(path.resolve(__dirname, '..', 'backend', 'services', 'python_bridge'));

  const result = await pythonBridge.call('extract_memories', {
    user_id: userId,
    conversations,
    date: todayString(),
  });

  return result; // { facts: [...], entities: [...], sentiments: [...] }
}

/**
 * Merge extracted facts into the user's memory profile.
 * Deduplicates against existing facts by content hash.
 */
async function mergeIntoProfile(userId, extraction) {
  const profile = await memoryService.getProfile(userId);

  // --- Facts ---
  const existingFacts = profile.facts || [];
  const existingSet = new Set(existingFacts.map((f) => f.content || f));
  const newFacts = (extraction.facts || []).filter((f) => {
    const content = f.content || f;
    return !existingSet.has(content);
  });

  if (newFacts.length > 0) {
    const updatedFacts = [
      ...existingFacts,
      ...newFacts.map((f) => ({
        content: f.content || f,
        source: 'nightly_extraction',
        extracted_at: new Date().toISOString(),
        confidence: f.confidence || 1.0,
      })),
    ];
    await memoryService.updateProfile(userId, { facts: updatedFacts });
  }

  // --- Entities (people, places, things mentioned) ---
  if (extraction.entities && extraction.entities.length > 0) {
    const existingEntities = profile.entities || [];
    const entitySet = new Set(existingEntities.map((e) => `${e.type}:${e.name}`));
    const newEntities = extraction.entities.filter(
      (e) => !entitySet.has(`${e.type}:${e.name}`)
    );
    if (newEntities.length > 0) {
      await memoryService.updateProfile(userId, {
        entities: [...existingEntities, ...newEntities],
      });
    }
  }

  // --- Sentiment / mood data ---
  if (extraction.sentiments && extraction.sentiments.length > 0) {
    const moodLog = profile.mood_log || [];
    const todayEntry = {
      date: todayString(),
      sentiments: extraction.sentiments,
      average: extraction.sentiments.reduce((sum, s) => sum + (s.score || 0), 0) / extraction.sentiments.length,
    };
    await memoryService.updateProfile(userId, {
      mood_log: [...moodLog, todayEntry],
    });
  }

  return { newFacts: newFacts.length, newEntities: (extraction.entities || []).length };
}

/**
 * Record extraction metadata so we can track runs and avoid duplicates.
 */
async function recordExtractionRun(userId, stats) {
  const meta = {
    type: 'extraction_run',
    date: todayString(),
    timestamp: new Date().toISOString(),
    stats,
  };
  await memoryService.storeConversation(userId, meta);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const startTime = Date.now();
  console.log(`[extraction] Run started at ${new Date().toISOString()}`);

  let users;
  try {
    users = await memoryService.listUsers();
  } catch (err) {
    console.error(`[extraction] Failed to list users: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[extraction] Processing ${users.length} user(s)`);

  let processed = 0;
  let skipped = 0;
  let errored = 0;

  for (const userId of users) {
    try {
      // Gather today's conversations
      const conversations = await memoryService.getConversations(userId, {
        date: todayString(),
      });

      if (!conversations || conversations.length === 0) {
        console.log(`[extraction] User ${userId} has no conversations today — skipping`);
        skipped++;
        continue;
      }

      // Filter out system-generated entries (briefings, extraction runs, etc.)
      const userConversations = conversations.filter(
        (c) => !['briefing', 'extraction_run', 'weekly_insight', 'reengagement'].includes(c.type)
      );

      if (userConversations.length === 0) {
        console.log(`[extraction] User ${userId} has no user conversations today — skipping`);
        skipped++;
        continue;
      }

      console.log(`[extraction] Extracting from ${userConversations.length} conversation(s) for user ${userId}...`);

      // Run extraction
      const extraction = await extractMemories(userId, userConversations);

      // Merge results into profile
      const stats = await mergeIntoProfile(userId, extraction);

      // Record the run
      await recordExtractionRun(userId, {
        conversations_processed: userConversations.length,
        new_facts: stats.newFacts,
        new_entities: stats.newEntities,
      });

      processed++;
      console.log(
        `[extraction] User ${userId}: ${stats.newFacts} new fact(s), ${stats.newEntities} new entit(ies)`
      );
    } catch (err) {
      errored++;
      console.error(`[extraction] Error for user ${userId}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(
    `[extraction] Done in ${elapsed}s — processed: ${processed}, skipped: ${skipped}, errors: ${errored}`
  );
}

// ---------------------------------------------------------------------------
// Execute when run directly
// ---------------------------------------------------------------------------
if (require.main === module) {
  run().catch((err) => {
    console.error(`[extraction] Unhandled error: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { run };
