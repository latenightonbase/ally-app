/**
 * weekly_insights.js — Weekly summary generator for Ally
 *
 * Runs once a week (Sunday evening). For each user it analyzes the past
 * week's conversations and memory-profile changes, then generates a
 * structured weekly insight covering mood trends, goal progress, and
 * relationship updates. The insight is stored as a special
 * "weekly_insight" entry in the user's data.
 *
 * Standalone:  node cron/weekly_insights.js
 *
 * Production integration:
 *   - Bull / BullMQ:  queue.add({}, { repeat: { cron: '0 20 * * 0' } })  // Sunday 20:00
 *   - Agenda:         agenda.every('0 20 * * 0', 'weekly-insights')
 *   - Cloud cron:     AWS EventBridge / GCP Cloud Scheduler Sunday 20:00
 *   - node-cron:      cron.schedule('0 20 * * 0', run)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const path = require('path');
const memoryService = require(path.resolve(__dirname, '..', 'backend', 'services', 'memory'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return an array of YYYY-MM-DD strings for the past 7 days (inclusive of today).
 */
function pastWeekDates() {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Gather all user conversations from the past week.
 */
async function getWeekConversations(userId) {
  const dates = pastWeekDates();
  const all = [];
  for (const date of dates) {
    try {
      const convos = await memoryService.getConversations(userId, { date });
      if (convos && convos.length > 0) {
        all.push(...convos.filter(
          (c) => !['briefing', 'extraction_run', 'weekly_insight', 'reengagement'].includes(c.type)
        ));
      }
    } catch {
      // Date may have no data — continue
    }
  }
  return all;
}

/**
 * Compute mood trend from the profile's mood_log entries for this week.
 */
function computeMoodTrend(profile) {
  const weekDates = new Set(pastWeekDates());
  const moodLog = (profile.mood_log || []).filter((m) => weekDates.has(m.date));

  if (moodLog.length === 0) {
    return { trend: 'insufficient_data', entries: 0 };
  }

  const averages = moodLog.map((m) => m.average);
  const weekAvg = averages.reduce((a, b) => a + b, 0) / averages.length;

  // Simple trend: compare first half to second half
  const mid = Math.floor(averages.length / 2) || 1;
  const firstHalf = averages.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const secondHalf = averages.slice(mid).reduce((a, b) => a + b, 0) / (averages.length - mid);

  let direction = 'stable';
  const delta = secondHalf - firstHalf;
  if (delta > 0.15) direction = 'improving';
  else if (delta < -0.15) direction = 'declining';

  return {
    trend: direction,
    weekAverage: parseFloat(weekAvg.toFixed(3)),
    entries: moodLog.length,
    delta: parseFloat(delta.toFixed(3)),
  };
}

/**
 * Analyze goal progress by checking facts tagged as goals and any
 * updates or completions recorded during the week.
 */
function analyzeGoalProgress(profile, conversations) {
  const goals = (profile.facts || []).filter(
    (f) => (f.category === 'goal' || (f.content && f.content.toLowerCase().includes('goal')))
  );

  // Look for goal-related keywords in conversations
  const goalKeywords = ['finished', 'completed', 'done with', 'achieved', 'started', 'working on', 'progress'];
  const goalMentions = conversations.filter((c) => {
    const text = (c.content || c.message || '').toLowerCase();
    return goalKeywords.some((kw) => text.includes(kw));
  });

  return {
    tracked_goals: goals.length,
    goal_related_conversations: goalMentions.length,
    goals: goals.map((g) => g.content || g).slice(0, 10), // cap at 10
  };
}

/**
 * Summarize relationship updates: new entities of type "person" added
 * this week, or mentions of known people in conversations.
 */
function analyzeRelationships(profile, conversations) {
  const weekDates = new Set(pastWeekDates());
  const people = (profile.entities || []).filter((e) => e.type === 'person');

  // New people discovered this week
  const newPeople = people.filter((p) => {
    if (!p.first_seen) return false;
    return weekDates.has(p.first_seen.slice(0, 10));
  });

  // Count mentions of known people in this week's conversations
  const mentionCounts = {};
  for (const person of people) {
    const name = (person.name || '').toLowerCase();
    if (!name) continue;
    let count = 0;
    for (const c of conversations) {
      const text = (c.content || c.message || '').toLowerCase();
      if (text.includes(name)) count++;
    }
    if (count > 0) mentionCounts[person.name] = count;
  }

  return {
    known_people: people.length,
    new_people_this_week: newPeople.map((p) => p.name),
    mention_counts: mentionCounts,
  };
}

/**
 * Call the Python AI pipeline to generate a natural-language weekly summary.
 * Falls back to a structured-data-only summary if the bridge is unavailable.
 */
async function generateNarrativeSummary(userId, analysisData) {
  try {
    const pythonBridge = require(path.resolve(__dirname, '..', 'backend', 'services', 'python_bridge'));
    const result = await pythonBridge.call('generate_weekly_insight', {
      user_id: userId,
      analysis: analysisData,
    });
    return result.summary || null;
  } catch {
    // Python bridge unavailable — return null so we store structured data only
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const startTime = Date.now();
  console.log(`[weekly] Run started at ${new Date().toISOString()}`);

  let users;
  try {
    users = await memoryService.listUsers();
  } catch (err) {
    console.error(`[weekly] Failed to list users: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[weekly] Processing ${users.length} user(s)`);

  let generated = 0;
  let skipped = 0;
  let errored = 0;

  for (const userId of users) {
    try {
      const profile = await memoryService.getProfile(userId);
      const conversations = await getWeekConversations(userId);

      if (conversations.length === 0) {
        console.log(`[weekly] User ${userId} had no conversations this week — skipping`);
        skipped++;
        continue;
      }

      // Build analysis
      const moodTrend = computeMoodTrend(profile);
      const goalProgress = analyzeGoalProgress(profile, conversations);
      const relationships = analyzeRelationships(profile, conversations);

      const analysisData = {
        period: {
          start: pastWeekDates()[0],
          end: pastWeekDates()[6],
        },
        total_conversations: conversations.length,
        mood: moodTrend,
        goals: goalProgress,
        relationships,
      };

      // Try to get a narrative summary from the AI
      const narrative = await generateNarrativeSummary(userId, analysisData);

      // Store the weekly insight
      const insight = {
        type: 'weekly_insight',
        timestamp: new Date().toISOString(),
        period: analysisData.period,
        analysis: analysisData,
        narrative: narrative, // may be null if AI was unavailable
      };

      await memoryService.storeConversation(userId, insight);

      generated++;
      console.log(
        `[weekly] User ${userId}: ${conversations.length} convos, mood=${moodTrend.trend}, ` +
        `goals=${goalProgress.tracked_goals}, people=${relationships.known_people}`
      );
    } catch (err) {
      errored++;
      console.error(`[weekly] Error for user ${userId}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(
    `[weekly] Done in ${elapsed}s — generated: ${generated}, skipped: ${skipped}, errors: ${errored}`
  );
}

// ---------------------------------------------------------------------------
// Execute when run directly
// ---------------------------------------------------------------------------
if (require.main === module) {
  run().catch((err) => {
    console.error(`[weekly] Unhandled error: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { run };
