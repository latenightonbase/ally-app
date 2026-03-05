export type MemoryCategory =
  | "personal_info"
  | "relationships"
  | "work"
  | "health"
  | "interests"
  | "goals"
  | "emotional_patterns";

export type GoalStatus = "active" | "completed" | "paused" | "abandoned";
export type FollowupPriority = "high" | "medium" | "low";
export type MoodTrend = "improving" | "declining" | "stable" | "mixed";
export type FactUpdateType = "new" | "update" | "correction";

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
}
