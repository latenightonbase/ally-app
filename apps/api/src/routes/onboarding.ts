import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { generateOnboardingFollowups, processOnboardingConversation } from "../ai/onboarding";
import { AIError } from "../ai/client";
import { updateProfile } from "../services/memory";
import { createReminder } from "../services/reminderService";
import { computeNextDailyPing } from "../jobs/dailyPing";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import type { MemoryProfile, DynamicAttribute, OnboardingQA } from "@ally/shared";

function buildProfile(
  userId: string,
  data: Partial<MemoryProfile>,
  overrides: { userName: string },
): MemoryProfile {
  return {
    userId,
    version: 2,
    personalInfo: {
      preferredName: data.personalInfo?.preferredName ?? overrides.userName,
      fullName: data.personalInfo?.fullName ?? null,
      age: data.personalInfo?.age ?? null,
      birthday: data.personalInfo?.birthday ?? null,
      location: data.personalInfo?.location ?? null,
      livingSituation: data.personalInfo?.livingSituation ?? null,
      other: {},
    },
    relationships: data.relationships ?? [],
    work: {
      role: data.work?.role ?? null,
      company: data.work?.company ?? null,
      companyType: null,
      currentProjects: [],
      currentGoals: data.work?.currentGoals ?? [],
      stressors: data.work?.stressors ?? [],
      colleagues: [],
    },
    health: {
      fitnessGoals: data.health?.fitnessGoals ?? [],
      currentRoutine: null,
      sleepNotes: null,
      dietNotes: null,
      mentalHealthNotes: data.health?.mentalHealthNotes ?? null,
      other: {},
    },
    interests: data.interests ?? [],
    goals: data.goals ?? [],
    emotionalPatterns: {
      primaryStressors: data.emotionalPatterns?.primaryStressors ?? [],
      copingMechanisms: data.emotionalPatterns?.copingMechanisms ?? [],
      moodTrends: [],
      recurringThemes: [],
      sensitivities: data.emotionalPatterns?.sensitivities ?? [],
    },
    pendingFollowups: [],
    dynamicAttributes: normaliseDynamicAttributes(data.dynamicAttributes),
    updatedAt: new Date().toISOString(),
  };
}

function normaliseDynamicAttributes(
  raw: Record<string, { value: string; confidence: number; learnedAt?: string }> | undefined,
): Record<string, DynamicAttribute> | undefined {
  if (!raw || Object.keys(raw).length === 0) return undefined;
  const now = new Date().toISOString();
  const result: Record<string, DynamicAttribute> = {};
  for (const [key, attr] of Object.entries(raw)) {
    if (attr.confidence >= 0.8 && attr.value) {
      result[key] = {
        value: attr.value,
        confidence: attr.confidence,
        learnedAt: attr.learnedAt ?? now,
      };
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export const onboardingRoutes = new Elysia({ prefix: "/api/v1" })
  .use(authMiddleware)
  .post(
    "/onboarding/followup",
    async ({ body, user, set }) => {
      try {
        const { data } = await generateOnboardingFollowups({
          userName: body.userName,
          allyName: body.allyName,
          conversation: body.conversation as OnboardingQA[],
          dynamicRound: body.dynamicRound,
        });

        if (data.memoryUpdates && Object.keys(data.memoryUpdates).length > 0) {
          try {
            await updateProfile(user.id, data.memoryUpdates as Partial<MemoryProfile>);
          } catch {
            console.warn("[onboarding/followup] Failed to save incremental memory updates");
          }
        }

        return {
          questions: data.questions,
          summary: data.summary || "",
        };
      } catch (e) {
        if (e instanceof AIError) {
          set.status = e.statusCode;
          throw new Error(e.message);
        }
        throw e;
      }
    },
    {
      body: t.Object({
        userName: t.String(),
        allyName: t.String(),
        conversation: t.Array(
          t.Object({
            question: t.String(),
            answer: t.String(),
          }),
        ),
        dynamicRound: t.Number(),
      }),
    },
  )
  .post(
    "/onboarding/complete",
    async ({ body, user, set }) => {
      try {
        const { data } = await processOnboardingConversation({
          userName: body.userName,
          allyName: body.allyName,
          conversation: body.conversation as OnboardingQA[],
        });

        const profile = buildProfile(user.id, data.memoryProfile, {
          userName: body.userName,
        });
        await updateProfile(user.id, profile);

        // Compute the absolute UTC timestamp for the first daily ping
        const nextDailyPingAt = computeNextDailyPing(body.dailyPingTime, body.timezone);

        await db
          .update(schema.user)
          .set({
            notificationPreferences: {
              dailyPingTime: body.dailyPingTime,
              timezone: body.timezone,
            },
            allyName: body.allyName,
            ...(nextDailyPingAt ? { nextDailyPingAt } : {}),
          })
          .where(eq(schema.user.id, user.id));

        // Schedule a welcome reminder for the user's first daily ping time
        try {
          const welcomeRemindAt = computeNextDailyPing(body.dailyPingTime, body.timezone);
          if (welcomeRemindAt) {
            await createReminder({
              userId: user.id,
              title: `${body.allyName} is ready for you`,
              body: `Hey ${body.userName}! I'm all set up and ready to chat whenever you are. Just wanted to say hi 👋`,
              remindAt: welcomeRemindAt,
              timezone: body.timezone,
              source: "onboarding",
              metadata: { type: "welcome", allyName: body.allyName },
            });
          }

          // If any goals were mentioned during onboarding, create reminders
          const goals = data.memoryProfile?.goals ?? [];
          for (const goal of goals.filter((g) => g.status === "active").slice(0, 2)) {
            const goalRemindAt = new Date(Date.now() + 3 * 86400_000); // 3 days from now
            goalRemindAt.setHours(10, 0, 0, 0);

            await createReminder({
              userId: user.id,
              title: `How's the goal going?`,
              body: `You mentioned wanting to: ${goal.description}. Just checking in — how's that going?`,
              remindAt: goalRemindAt,
              timezone: body.timezone,
              source: "onboarding",
              metadata: { type: "goal_followup", goal: goal.description },
            });
          }
        } catch (err) {
          console.warn("[onboarding/complete] Failed to create welcome reminders:", err);
        }

        set.status = 201;
        return {
          greeting: data.greeting,
          memoryProfileCreated: true,
        };
      } catch (e) {
        if (e instanceof AIError) {
          set.status = e.statusCode;
          throw new Error(e.message);
        }
        throw e;
      }
    },
    {
      body: t.Object({
        userName: t.String(),
        allyName: t.String(),
        conversation: t.Array(
          t.Object({
            question: t.String(),
            answer: t.String(),
          }),
        ),
        dailyPingTime: t.String(),
        timezone: t.String(),
      }),
    },
  );
