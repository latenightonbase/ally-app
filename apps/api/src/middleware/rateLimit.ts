import { Elysia } from "elysia";
import { TIER_LIMITS } from "@ally/shared";
import type { Tier } from "@ally/shared";

interface RateBucket {
  count: number;
  resetAt: number;
}

const minuteBuckets = new Map<string, RateBucket>();
const dailyBuckets = new Map<string, RateBucket>();

function getMinuteBucket(userId: string): RateBucket {
  const key = userId;
  const now = Date.now();
  const existing = minuteBuckets.get(key);

  if (!existing || now >= existing.resetAt) {
    const bucket = { count: 0, resetAt: now + 60_000 };
    minuteBuckets.set(key, bucket);
    return bucket;
  }
  return existing;
}

function getDailyBucket(userId: string): RateBucket {
  const key = userId;
  const now = Date.now();
  const existing = dailyBuckets.get(key);

  if (!existing || now >= existing.resetAt) {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const bucket = { count: 0, resetAt: midnight.getTime() };
    dailyBuckets.set(key, bucket);
    return bucket;
  }
  return existing;
}

export const rateLimitMiddleware = new Elysia({ name: "rate-limit" }).derive(
  { as: "scoped" },
  ({ set, ...ctx }: any) => {
    const user = ctx.user;
    if (!user) return {};

    const tier = user.tier as Tier;
    const limits = TIER_LIMITS[tier];

    const minuteBucket = getMinuteBucket(user.id);
    if (minuteBucket.count >= limits.requestsPerMinute) {
      set.status = 429;
      set.headers["x-ratelimit-limit"] = String(limits.requestsPerMinute);
      set.headers["x-ratelimit-remaining"] = "0";
      set.headers["x-ratelimit-reset"] = String(
        Math.floor(minuteBucket.resetAt / 1000),
      );
      throw new Error(
        "Rate limit exceeded. Please slow down.",
      );
    }
    minuteBucket.count++;

    const dailyBucket = getDailyBucket(user.id);
    const dailyLimit = limits.messagesPerDay;

    set.headers["x-ratelimit-limit"] = dailyLimit
      ? String(dailyLimit)
      : "unlimited";
    set.headers["x-ratelimit-remaining"] = dailyLimit
      ? String(Math.max(0, dailyLimit - dailyBucket.count))
      : "unlimited";
    set.headers["x-ratelimit-reset"] = String(
      Math.floor(dailyBucket.resetAt / 1000),
    );

    return {
      rateLimit: {
        checkMessageLimit(): void {
          if (dailyLimit !== null && dailyBucket.count >= dailyLimit) {
            set.status = 429;
            throw new Error(
              `You have reached your daily limit of ${dailyLimit} messages. Upgrade your plan for more.`,
            );
          }
          dailyBucket.count++;
        },
      },
    };
  },
);

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of minuteBuckets) {
    if (now >= bucket.resetAt) minuteBuckets.delete(key);
  }
  for (const [key, bucket] of dailyBuckets) {
    if (now >= bucket.resetAt) dailyBuckets.delete(key);
  }
}, 300_000);
