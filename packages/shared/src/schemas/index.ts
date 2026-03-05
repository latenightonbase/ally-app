import { z } from "zod";

export const chatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});

export const onboardingRequestSchema = z.object({
  answers: z.object({
    nameAndGreeting: z.string().min(1),
    lifeContext: z.string().min(1),
    currentFocus: z.string().min(1),
    stressAndSupport: z.string().min(1),
    allyExpectations: z.string().min(1),
  }),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const memoryFactsQuerySchema = paginationSchema.extend({
  category: z
    .enum([
      "personal_info",
      "relationships",
      "work",
      "health",
      "interests",
      "goals",
      "emotional_patterns",
    ])
    .optional(),
});

export const briefingQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const subscriptionWebhookSchema = z.object({
  userId: z.string().uuid(),
  event: z.literal("subscription_updated"),
  tier: z.enum(["free_trial", "basic", "pro", "premium"]),
  effectiveAt: z.string().datetime(),
});
