export type Tier = "free_trial" | "basic" | "premium";

export interface User {
  id: string;
  email: string;
  name: string;
  tier: Tier;
  trialEndsAt: string | null;
  createdAt: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  tier: Tier;
  trialEndsAt: string | null;
  iat: number;
  exp: number;
}

export interface TierLimits {
  messagesPerDay: number | null;
  requestsPerMinute: number;
  memoryRetentionDays: number | null;
  conversationHistoryDays: number | null;
  morningBriefings: boolean;
  proactiveFollowups: boolean;
  weeklyInsights: boolean;
}
