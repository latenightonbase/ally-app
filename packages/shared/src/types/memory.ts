export type MemoryCategory =
  | "personal_info"
  | "relationships"
  | "work"
  | "health"
  | "interests"
  | "goals"
  | "emotional_patterns";

export type MemoryType = "semantic" | "episodic" | "event";
export type EntityType = "person" | "place" | "org" | "topic" | "goal";
export type GoalStatus = "active" | "completed" | "paused" | "abandoned";
export type FollowupPriority = "high" | "medium" | "low";
export type MoodTrend = "improving" | "declining" | "stable" | "mixed";
export type FactUpdateType = "new" | "update" | "correction";
export type MemorySourceType = "chat" | "calendar" | "notes" | "health";

export interface Relationship {
  name: string;
  relation: string;
  notes: string;
  lastMentioned: string | null;
}

export interface Interest {
  topic: string;
  detail: string | null;
  firstMentioned: string;
}

export interface Goal {
  description: string;
  category: string;
  status: GoalStatus;
  progressNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MoodEntry {
  period: string;
  trend: MoodTrend;
  notes: string;
}

export interface PendingFollowup {
  topic: string;
  context: string;
  detectedAt: string;
  resolved: boolean;
  priority: FollowupPriority;
}

/**
 * A dynamic attribute is something Ally learned about this specific person
 * that doesn't fit any fixed category — communication style, relationship with
 * failure, humor, values, creative identity, etc. These are promoted from
 * recurring high-confidence cold-tier patterns and injected into every AI call.
 */
export interface DynamicAttribute {
  value: string;
  confidence: number;
  learnedAt: string;
  sourceConversationId?: string;
}

export interface MemoryProfile {
  userId: string;
  version: number;
  personalInfo: {
    preferredName: string | null;
    fullName: string | null;
    age: number | null;
    birthday: string | null;
    location: string | null;
    livingSituation: string | null;
    other: Record<string, unknown>;
  };
  relationships: Relationship[];
  work: {
    role: string | null;
    company: string | null;
    companyType: string | null;
    currentProjects: string[];
    currentGoals: string[];
    stressors: string[];
    colleagues: string[];
  };
  health: {
    fitnessGoals: string[];
    currentRoutine: string | null;
    sleepNotes: string | null;
    dietNotes: string | null;
    mentalHealthNotes: string | null;
    other: Record<string, unknown>;
  };
  interests: Interest[];
  goals: Goal[];
  emotionalPatterns: {
    primaryStressors: string[];
    copingMechanisms: string[];
    moodTrends: MoodEntry[];
    recurringThemes: string[];
    sensitivities: string[];
  };
  pendingFollowups: PendingFollowup[];
  /**
   * Open-ended personality/behavioral traits Ally has learned from patterns.
   * Keys are snake_case descriptors (e.g. "communication_style", "relationship_with_failure").
   * Populated by consolidation and extraction; injected into every system prompt.
   */
  dynamicAttributes?: Record<string, DynamicAttribute>;
  updatedAt: string;
}

export interface MemoryFact {
  id: string;
  userId: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  confidence: number;
  temporal: boolean;
  entities: string[];
  emotion: string | null;
  updateType: FactUpdateType;
  sourceConversationId: string | null;
  sourceDate: string;
  createdAt: string;
}

export interface ExtractedFact {
  content: string;
  category: MemoryCategory;
  confidence: number;
  importance: number;
  updateType: FactUpdateType;
  entities: string[];
  emotion: string | null;
  temporal: boolean;
  memoryType: MemoryType;
  eventDate: string | null;
  supersedes?: string | null;
}

export interface ExtractedEntity {
  name: string;
  type: EntityType;
  description: string | null;
  aliases: string[];
  relatedTo: { name: string; relation: string }[];
}

export interface MemoryEpisode {
  id: string;
  userId: string;
  content: string;
  category: MemoryCategory;
  emotion: string | null;
  entities: string[];
  importance: number;
  confidence: number;
  expiresAt: string;
  consolidatedAt: string | null;
  consolidatedIntoFactId: string | null;
  sourceConversationId: string | null;
  sourceType: MemorySourceType;
  sourceDate: string;
  createdAt: string;
}

export interface MemoryEvent {
  id: string;
  userId: string;
  content: string;
  eventDate: string;
  context: string | null;
  notifiedAt: string | null;
  completedAt: string | null;
  sourceConversationId: string | null;
  sourceType: MemorySourceType;
  createdAt: string;
}

export interface EntityNode {
  id: string;
  userId: string;
  type: EntityType;
  name: string;
  normalizedName: string;
  description: string | null;
  aliases: string[];
  factIds: string[];
  episodeIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type ReminderStatus = "pending" | "sent" | "dismissed";
export type ReminderSource = "chat" | "extraction" | "onboarding" | "system";

export interface Reminder {
  id: string;
  userId: string;
  conversationId: string | null;
  title: string;
  body: string | null;
  remindAt: string;
  timezone: string | null;
  source: ReminderSource;
  status: ReminderStatus;
  notifiedAt: string | null;
  dismissedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreateReminderInput {
  userId: string;
  title: string;
  body?: string;
  remindAt: Date | string;
  timezone?: string;
  conversationId?: string;
  source?: ReminderSource;
  metadata?: Record<string, unknown>;
}
