import type { Tier, TierLimits } from "../types/user";

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free_trial: {
    messagesPerDay: 20,
    requestsPerMinute: 10,
    memoryRetentionDays: 14,
    conversationHistoryDays: 7,
    morningBriefings: false,
    proactiveFollowups: false,
    weeklyInsights: false,
  },
  basic: {
    messagesPerDay: 50,
    requestsPerMinute: 15,
    memoryRetentionDays: 90,
    conversationHistoryDays: 30,
    morningBriefings: false,
    proactiveFollowups: false,
    weeklyInsights: false,
  },
  pro: {
    messagesPerDay: null,
    requestsPerMinute: 30,
    memoryRetentionDays: null,
    conversationHistoryDays: null,
    morningBriefings: true,
    proactiveFollowups: false,
    weeklyInsights: false,
  },
  premium: {
    messagesPerDay: null,
    requestsPerMinute: 60,
    memoryRetentionDays: null,
    conversationHistoryDays: null,
    morningBriefings: true,
    proactiveFollowups: true,
    weeklyInsights: true,
  },
} as const;
