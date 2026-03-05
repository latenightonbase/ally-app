/**
 * daily_briefings.js — Morning briefing scheduler for Ally
 *
 * Designed to run every 15 minutes via a job scheduler. On each run it
 * iterates all users, checks their preferred wake time + timezone, and
 * triggers a briefing for any user whose wake-time window falls within
 * the current 15-minute slot.
 *
 * Standalone:  node cron/daily_briefings.js
 *
 * Production integration:
 *   - Bull / BullMQ:  new Queue('daily-briefings').add({}, { repeat: { every: 15 * 60 * 1000 } })
 *   - Agenda:         agenda.every('15 minutes', 'daily-briefings')
 *   - Cloud cron:     AWS EventBridge / GCP Cloud Scheduler every 15 min
 *   - node-cron:      cron.schedule('*/15 * * * *', run)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const path = require('path');
const memoryService = require(path.resolve(__dirname, '..', 'backend', 'services', 'memory'));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DEFAULT_WAKE_HOUR = 8; // 08:00 local time
const DEFAULT_WAKE_MINUTE = 0;
const DEFAULT_TIMEZONE = 'America/New_York';
const WINDOW_MINUTES = 15; // must match scheduler cadence
const BRIEFING_API_URL = process.env.BRIEFING_API_URL || 'http://localhost:3000/api/briefing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the current hour and minute in a given IANA timezone.
 */
function nowInTimezone(tz) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = parseInt(parts.find((p) => p.type === 'hour').value, 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute').value, 10);
  return { hour, minute };
}

/**
 * True when the user's local time is within WINDOW_MINUTES of their wake time.
 */
function isWakeWindow(profile) {
  const tz = profile.timezone || DEFAULT_TIMEZONE;
  const wakeHour = profile.wake_hour ?? DEFAULT_WAKE_HOUR;
  const wakeMinute = profile.wake_minute ?? DEFAULT_WAKE_MINUTE;

  const { hour, minute } = nowInTimezone(tz);

  const nowTotal = hour * 60 + minute;
  const wakeTotal = wakeHour * 60 + wakeMinute;

  // User's local time is within [wakeTime, wakeTime + WINDOW_MINUTES)
  return nowTotal >= wakeTotal && nowTotal < wakeTotal + WINDOW_MINUTES;
}

/**
 * Check whether a briefing was already sent today for this user.
 */
async function alreadySentToday(userId) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  try {
    const conversations = await memoryService.getConversations(userId, { date: today });
    return conversations.some((c) => c.type === 'briefing');
  } catch {
    return false;
  }
}

/**
 * Generate and store a morning briefing for one user.
 * Tries the HTTP API first; falls back to the python-bridge directly.
 */
async function generateBriefing(userId, profile) {
  // Attempt 1: call the /api/briefing endpoint
  try {
    const response = await fetch(BRIEFING_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (response.ok) {
      const data = await response.json();
      return data;
    }
    console.warn(`[briefing] API returned ${response.status} for user ${userId}, falling back to python-bridge`);
  } catch (err) {
    console.warn(`[briefing] API unreachable for user ${userId}: ${err.message}, falling back to python-bridge`);
  }

  // Attempt 2: call python-bridge directly
  try {
    const pythonBridge = require(path.resolve(__dirname, '..', 'backend', 'services', 'python_bridge'));
    const result = await pythonBridge.call('generate_briefing', {
      user_id: userId,
      memory_profile: profile,
    });
    // Persist the briefing as a conversation entry
    await memoryService.storeConversation(userId, {
      type: 'briefing',
      content: result.briefing,
      timestamp: new Date().toISOString(),
    });
    return result;
  } catch (err) {
    throw new Error(`Python-bridge briefing failed for user ${userId}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const startTime = Date.now();
  console.log(`[briefing] Run started at ${new Date().toISOString()}`);

  let users;
  try {
    users = await memoryService.listUsers();
  } catch (err) {
    console.error(`[briefing] Failed to list users: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[briefing] Found ${users.length} user(s)`);

  let sent = 0;
  let skipped = 0;
  let errored = 0;

  for (const userId of users) {
    try {
      const profile = await memoryService.getProfile(userId);

      if (!isWakeWindow(profile)) {
        skipped++;
        continue;
      }

      if (await alreadySentToday(userId)) {
        console.log(`[briefing] User ${userId} already received today's briefing — skipping`);
        skipped++;
        continue;
      }

      console.log(`[briefing] Generating briefing for user ${userId}...`);
      await generateBriefing(userId, profile);
      sent++;
      console.log(`[briefing] Briefing sent to user ${userId}`);
    } catch (err) {
      errored++;
      console.error(`[briefing] Error for user ${userId}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[briefing] Done in ${elapsed}s — sent: ${sent}, skipped: ${skipped}, errors: ${errored}`);
}

// ---------------------------------------------------------------------------
// Execute when run directly
// ---------------------------------------------------------------------------
if (require.main === module) {
  run().catch((err) => {
    console.error(`[briefing] Unhandled error: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { run };
