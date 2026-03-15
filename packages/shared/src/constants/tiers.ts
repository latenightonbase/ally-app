import type { Tier, TierLimits } from "../types/user";

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  // Full feature access during 14-day trial — same limits as Basic
  free_trial: {
    messagesPerDay: null,
    requestsPerMinute: 30,
    memoryRetentionDays: null,
    conversationHistoryDays: null,
    morningBriefings: true,
    proactiveFollowups: false,
    weeklyInsights: false,
  },
  // Paid entry tier — unlimited messages, briefings, full You screen
  basic: {
    messagesPerDay: null,
    requestsPerMinute: 30,
    memoryRetentionDays: null,
    conversationHistoryDays: null,
    morningBriefings: true,
    proactiveFollowups: false,
    weeklyInsights: false,
  },
  // Top tier — everything + proactive check-ins, weekly insights, behavioral intelligence
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
