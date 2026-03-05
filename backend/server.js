require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { authenticate } = require('./middleware/auth');
const claude = require('./services/claude');
const memory = require('./services/memory');
const pythonBridge = require('./services/python-bridge');

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ally-backend' });
});

/**
 * POST /api/chat
 * Receives a user message, injects memory context, returns Ally's response.
 * Body: { userId, message }
 */
app.post('/api/chat', authenticate, async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.userId;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Load user's memory and recent conversation history
    const [userMemory, recentConversations] = await Promise.all([
      memory.getUserMemory(userId),
      memory.getConversationHistory(userId, 10),
    ]);

    // Build memory context for the system prompt
    const memoryContext = buildMemoryContext(userMemory);

    // Build message history from recent conversations
    const conversationMessages = [];
    for (const convo of recentConversations.reverse()) {
      for (const msg of convo.messages) {
        conversationMessages.push(msg);
      }
    }
    // Keep last 40 messages for context window management
    const trimmedHistory = conversationMessages.slice(-40);
    trimmedHistory.push({ role: 'user', content: message });

    const response = await claude.sendMessage(memoryContext, trimmedHistory);

    // Save this exchange
    await memory.saveConversation(userId, [
      { role: 'user', content: message },
      { role: 'assistant', content: response },
    ]);

    res.json({ response, userId });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

/**
 * POST /api/onboard
 * Processes onboarding answers into an initial memory profile.
 * Body: { userId, answers: { name, daily_routine, current_goal, important_people, wake_time } }
 */
app.post('/api/onboard', authenticate, async (req, res) => {
  try {
    const { answers } = req.body;
    const userId = req.userId;

    if (!answers) {
      return res.status(400).json({ error: 'answers object is required' });
    }

    const profile = await pythonBridge.runOnboarding(userId, answers);
    await memory.saveUserMemory(userId, profile);

    res.json({ profile, userId });
  } catch (err) {
    console.error('Onboarding error:', err);
    res.status(500).json({ error: 'Failed to process onboarding' });
  }
});

/**
 * GET /api/briefing/:userId
 * Generates a personalized morning briefing.
 */
app.get('/api/briefing/:userId', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const userMemory = await memory.getUserMemory(userId);
    const briefing = await pythonBridge.runBriefing(userId, userMemory);

    res.json({ briefing, userId });
  } catch (err) {
    console.error('Briefing error:', err);
    res.status(500).json({ error: 'Failed to generate briefing' });
  }
});

/**
 * POST /api/memory
 * Saves new facts about a user.
 * Body: { userId, facts: [{ category, data, ... }] }
 */
app.post('/api/memory', authenticate, async (req, res) => {
  try {
    const { facts } = req.body;
    const userId = req.userId;

    if (!Array.isArray(facts) || facts.length === 0) {
      return res.status(400).json({ error: 'facts array is required' });
    }

    const updatedMemory = await memory.appendFacts(userId, facts);
    res.json({ memory: updatedMemory, userId });
  } catch (err) {
    console.error('Memory save error:', err);
    res.status(500).json({ error: 'Failed to save memory' });
  }
});

/**
 * GET /api/memory/:userId
 * Returns the user's full memory profile.
 */
app.get('/api/memory/:userId', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const userMemory = await memory.getUserMemory(userId);
    res.json({ memory: userMemory, userId });
  } catch (err) {
    console.error('Memory read error:', err);
    res.status(500).json({ error: 'Failed to read memory' });
  }
});

// --- Helpers ---

function buildMemoryContext(mem) {
  const parts = [];

  if (mem.name) {
    parts.push(`The user's name is ${mem.name}.`);
  }

  if (mem.relationships?.length) {
    const people = mem.relationships.map((r) => `${r.name} (${r.relationship})`).join(', ');
    parts.push(`Important people in their life: ${people}.`);
  }

  if (mem.goals?.length) {
    const goals = mem.goals.map((g) => (typeof g === 'string' ? g : g.description)).join('; ');
    parts.push(`Current goals: ${goals}.`);
  }

  if (mem.interests?.length) {
    const interests = mem.interests.map((i) => (typeof i === 'string' ? i : i.name)).join(', ');
    parts.push(`Interests: ${interests}.`);
  }

  if (mem.work && Object.keys(mem.work).length) {
    parts.push(`Work context: ${JSON.stringify(mem.work)}.`);
  }

  if (mem.follow_ups?.length) {
    const followUps = mem.follow_ups
      .filter((f) => !f.resolved)
      .map((f) => f.description)
      .join('; ');
    if (followUps) {
      parts.push(`Unresolved items to potentially follow up on: ${followUps}.`);
    }
  }

  if (mem.emotional_patterns?.length) {
    const recent = mem.emotional_patterns.slice(-5);
    parts.push(`Recent emotional context: ${recent.map((e) => (typeof e === 'string' ? e : e.description)).join('; ')}.`);
  }

  if (!parts.length) return '';

  return `Here is what you know about this user from previous conversations. Reference these naturally, like a friend would — never say "according to my records" or similar.\n\n${parts.join('\n')}`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Ally backend running on port ${PORT}`);
});
