const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// --- Helpers ---

function userDir(userId) {
  return path.join(DATA_DIR, userId);
}

function memoryPath(userId) {
  return path.join(userDir(userId), 'memory.json');
}

function conversationsDir(userId) {
  return path.join(userDir(userId), 'conversations');
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// --- Default memory profile ---

function defaultMemory() {
  return {
    name: null,
    personal_info: {},
    relationships: [],
    work: {},
    health: {},
    interests: [],
    goals: [],
    emotional_patterns: [],
    preferences: {},
    important_dates: [],
    wake_time: '08:00',
    timezone: 'America/New_York',
    follow_ups: [],
    weekly_insights: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// --- Memory CRUD ---
// TODO: Replace file I/O with database queries (PostgreSQL/DynamoDB)

async function getUserMemory(userId) {
  try {
    const data = await fs.readFile(memoryPath(userId), 'utf-8');
    return JSON.parse(data);
  } catch {
    return defaultMemory();
  }
}

async function saveUserMemory(userId, memory) {
  await ensureDir(userDir(userId));
  memory.updated_at = new Date().toISOString();
  await fs.writeFile(memoryPath(userId), JSON.stringify(memory, null, 2));
}

async function appendFacts(userId, facts) {
  const memory = await getUserMemory(userId);

  for (const fact of facts) {
    const category = fact.category;
    if (!memory[category]) continue;

    if (Array.isArray(memory[category])) {
      memory[category].push({
        ...fact,
        extracted_at: new Date().toISOString(),
      });
    } else if (typeof memory[category] === 'object') {
      Object.assign(memory[category], fact.data || {});
    }
  }

  await saveUserMemory(userId, memory);
  return memory;
}

// --- Conversation history ---
// TODO: Replace with database table (conversations)

async function getConversationHistory(userId, limit = 20) {
  const dir = conversationsDir(userId);
  try {
    const files = await fs.readdir(dir);
    const sorted = files
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);

    const conversations = [];
    for (const file of sorted) {
      const data = await fs.readFile(path.join(dir, file), 'utf-8');
      conversations.push(JSON.parse(data));
    }
    return conversations;
  } catch {
    return [];
  }
}

async function saveConversation(userId, messages) {
  const dir = conversationsDir(userId);
  await ensureDir(dir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}.json`;
  const conversation = {
    timestamp: new Date().toISOString(),
    messages,
  };

  await fs.writeFile(path.join(dir, filename), JSON.stringify(conversation, null, 2));
}

// --- User listing ---
// TODO: Replace with database query

async function getAllUserIds() {
  try {
    await ensureDir(DATA_DIR);
    const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

module.exports = {
  getUserMemory,
  saveUserMemory,
  appendFacts,
  getConversationHistory,
  saveConversation,
  getAllUserIds,
  defaultMemory,
};
