/**
 * reengagement.js — Personalized re-engagement for Ally
 *
 * Checks for users inactive 3+ days and generates a tailored check-in
 * message based on their memory profile (pending follow-ups, known
 * interests, recent goals). Never generic "we miss you" -- always
 * something contextual.
 *
 * Queues notifications to a file-based queue that the notification
 * delivery service can pick up.
 *
 * Constraints:
 *   - Maximum 1 re-engagement per user per week
 *   - Only targets users inactive >= 3 days
 *
 * Standalone:  node cron/reengagement.js
 *
 * Production integration:
 *   - Bull / BullMQ:  queue.add({}, { repeat: { cron: '0 18 * * *' } })  // daily 18:00
 *   - Agenda:         agenda.every('0 18 * * *', 'reengagement')
 *   - Cloud cron:     AWS EventBridge / GCP Cloud Scheduler daily 18:00
 *   - node-cron:      cron.schedule('0 18 * * *', run)
 *
 *   In production, replace the file-based notification queue with a real
 *   message broker (SQS, Redis Streams, Kafka) or push-notification
 *   service (Firebase Cloud Messaging, APNs, OneSignal).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const fs = require('fs').promises;
const path = require('path');
const memoryService = require(path.resolve(__dirname, '..', 'backend', 'services', 'memory'));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const INACTIVE_DAYS_THRESHOLD = 3;
const MAX_REENGAGEMENT_PER_WEEK = 1;
const NOTIFICATION_QUEUE_DIR = path.resolve(__dirname, '..', 'data', 'notifications');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Determine the user's last activity date by scanning recent conversations.
 * Returns a Date or null if no activity found.
 */
async function getLastActivityDate(userId) {
  // Check the last 30 days for any conversation
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    try {
      const convos = await memoryService.getConversations(userId, { date: dateStr });
      const userConvos = (convos || []).filter(
        (c) => !['briefing', 'extraction_run', 'weekly_insight', 'reengagement'].includes(c.type)
      );
      if (userConvos.length > 0) {
        return d;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Check how many re-engagement messages were sent to this user in the past 7 days.
 */
async function reengagementsThisWeek(userId) {
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    try {
      const convos = await memoryService.getConversations(userId, { date: dateStr });
      count += (convos || []).filter((c) => c.type === 'reengagement').length;
    } catch {
      continue;
    }
  }
  return count;
}

/**
 * Build a personalized check-in message using the user's memory profile.
 * This crafts something specific -- never a generic "we miss you."
 */
async function buildCheckInMessage(userId, profile) {
  const strategies = [];

  // Strategy 1: Pending follow-ups
  const followUps = profile.pending_follow_ups || [];
  if (followUps.length > 0) {
    const item = followUps[0]; // pick the most recent/relevant
    const topic = item.topic || item.content || item;
    strategies.push({
      priority: 1,
      message: `Hey! Last time we talked, you mentioned ${topic}. How did that go?`,
      reason: 'pending_follow_up',
    });
  }

  // Strategy 2: Active goals
  const goals = (profile.facts || []).filter(
    (f) => f.category === 'goal' || (f.content && f.content.toLowerCase().includes('goal'))
  );
  if (goals.length > 0) {
    const goal = goals[goals.length - 1]; // most recent goal
    const goalText = goal.content || goal;
    strategies.push({
      priority: 2,
      message: `Checking in on your goal: "${goalText}". Any updates? I'd love to hear how it's going.`,
      reason: 'goal_progress',
    });
  }

  // Strategy 3: Known interests
  const interests = profile.interests || [];
  if (interests.length > 0) {
    const interest = interests[Math.floor(Math.random() * interests.length)];
    const interestText = interest.name || interest;
    strategies.push({
      priority: 3,
      message: `Been thinking about you! Anything new happening with ${interestText}?`,
      reason: 'interest_based',
    });
  }

  // Strategy 4: Recent entities (people they mentioned)
  const people = (profile.entities || []).filter((e) => e.type === 'person');
  if (people.length > 0) {
    const person = people[people.length - 1];
    strategies.push({
      priority: 4,
      message: `Hey! How are things going with ${person.name}? You were on my mind.`,
      reason: 'relationship_based',
    });
  }

  // Strategy 5: Mood-aware (if recent mood was low)
  const recentMood = (profile.mood_log || []).slice(-3);
  const avgMood = recentMood.length > 0
    ? recentMood.reduce((sum, m) => sum + (m.average || 0), 0) / recentMood.length
    : null;
  if (avgMood !== null && avgMood < 0.4) {
    strategies.push({
      priority: 0, // highest priority
      message: `Hey, just wanted to check in. No agenda -- just here if you want to talk.`,
      reason: 'mood_support',
    });
  }

  // If we have AI available, try to generate an even better message
  try {
    const pythonBridge = require(path.resolve(__dirname, '..', 'backend', 'services', 'python_bridge'));
    const result = await pythonBridge.call('generate_reengagement', {
      user_id: userId,
      profile_summary: {
        interests,
        goals: goals.map((g) => g.content || g),
        follow_ups: followUps.map((f) => f.topic || f.content || f),
        recent_mood: avgMood,
        name: profile.name || profile.display_name || null,
      },
    });
    if (result && result.message) {
      strategies.push({
        priority: -1, // AI-generated gets top priority
        message: result.message,
        reason: 'ai_generated',
      });
    }
  } catch {
    // AI unavailable -- use rule-based strategies
  }

  // Sort by priority (lower = higher priority) and pick the best
  strategies.sort((a, b) => a.priority - b.priority);

  if (strategies.length === 0) {
    // Absolute fallback -- still personalized with name if available
    const name = profile.name || profile.display_name || '';
    return {
      message: name
        ? `Hey ${name}! Haven't heard from you in a bit. What's been on your mind lately?`
        : `Hey! Haven't heard from you in a bit. What's been on your mind lately?`,
      reason: 'fallback_personalized',
    };
  }

  return strategies[0];
}

/**
 * Write a notification to the file-based queue.
 * Each notification is a JSON file in NOTIFICATION_QUEUE_DIR.
 */
async function queueNotification(userId, checkIn) {
  await fs.mkdir(NOTIFICATION_QUEUE_DIR, { recursive: true });

  const notification = {
    id: `reeng_${userId}_${Date.now()}`,
    userId,
    type: 'reengagement',
    message: checkIn.message,
    reason: checkIn.reason,
    created_at: new Date().toISOString(),
    status: 'pending',
  };

  const filePath = path.join(NOTIFICATION_QUEUE_DIR, `${notification.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(notification, null, 2), 'utf-8');

  return notification;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const startTime = Date.now();
  console.log(`[reengagement] Run started at ${new Date().toISOString()}`);

  let users;
  try {
    users = await memoryService.listUsers();
  } catch (err) {
    console.error(`[reengagement] Failed to list users: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[reengagement] Checking ${users.length} user(s) for inactivity`);

  let queued = 0;
  let skipped = 0;
  let errored = 0;

  for (const userId of users) {
    try {
      // Check last activity
      const lastActivity = await getLastActivityDate(userId);

      if (!lastActivity) {
        console.log(`[reengagement] User ${userId} has no recorded activity — skipping`);
        skipped++;
        continue;
      }

      const inactiveDays = Math.floor(
        (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (inactiveDays < INACTIVE_DAYS_THRESHOLD) {
        skipped++;
        continue;
      }

      // Check weekly limit
      const weekCount = await reengagementsThisWeek(userId);
      if (weekCount >= MAX_REENGAGEMENT_PER_WEEK) {
        console.log(
          `[reengagement] User ${userId} already received ${weekCount} re-engagement(s) this week — skipping`
        );
        skipped++;
        continue;
      }

      console.log(
        `[reengagement] User ${userId} inactive for ${inactiveDays} day(s) — generating check-in`
      );

      // Build personalized message
      const profile = await memoryService.getProfile(userId);
      const checkIn = await buildCheckInMessage(userId, profile);

      // Queue the notification
      const notification = await queueNotification(userId, checkIn);
      console.log(
        `[reengagement] Queued notification ${notification.id} for user ${userId} (reason: ${checkIn.reason})`
      );

      // Record the re-engagement in the user's conversation log
      await memoryService.storeConversation(userId, {
        type: 'reengagement',
        message: checkIn.message,
        reason: checkIn.reason,
        notification_id: notification.id,
        timestamp: new Date().toISOString(),
      });

      queued++;
    } catch (err) {
      errored++;
      console.error(`[reengagement] Error for user ${userId}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(
    `[reengagement] Done in ${elapsed}s — queued: ${queued}, skipped: ${skipped}, errors: ${errored}`
  );
}

// ---------------------------------------------------------------------------
// Execute when run directly
// ---------------------------------------------------------------------------
if (require.main === module) {
  run().catch((err) => {
    console.error(`[reengagement] Unhandled error: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { run };
