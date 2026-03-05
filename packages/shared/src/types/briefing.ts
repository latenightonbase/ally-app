export interface Briefing {
  id: string;
  userId: string;
  date: string;
  content: string;
  delivered: boolean;
  createdAt: string;
}

export interface WeeklyInsight {
  weekOf: string;
  summary: string;
  moodTrend: string;
  topThemes: string[];
  followUpSuggestions: string[];
}

export interface DetectedFollowup {
  topic: string;
  context: string;
  urgency: "high" | "medium" | "low";
  type: "pending_outcome" | "unfinished_conversation" | "expressed_anxiety" | "goal_checkin";
  suggestedTiming: string;
}
