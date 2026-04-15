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
  topThemes: string[];
  upcomingWeek: string[];
  followUpSuggestions: string[];
}

export interface DetectedFollowup {
  topic: string;
  context: string;
  urgency: "high" | "medium" | "low";
  type: "pending_outcome" | "unfinished_conversation" | "schedule_conflict" | "missed_task" | "upcoming_event";
  suggestedTiming: string;
  /** Which family member this relates to */
  memberName?: string;
}
