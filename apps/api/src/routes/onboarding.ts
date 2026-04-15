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
  overrides: { userName: string; familyId?: string },
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
    familyMembers: data.familyMembers ?? [],
    familyRoutines: data.familyRoutines ?? [],
    familyId: overrides.familyId,
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

/** Assign a color to each family member for calendar/UI display */
const MEMBER_COLORS = [
  "#4F46E5", "#059669", "#D97706", "#DC2626", "#7C3AED",
  "#DB2777", "#0891B2", "#65A30D", "#EA580C", "#6366F1",
];

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

        // --- Create family if the AI extracted family info ---
        let familyId: string | undefined;
        let familyCreated = false;

        const familyName = data.familyName || `${body.userName}'s Family`;
        const familyMembers = data.familyMembers ?? [];

        if (familyMembers.length > 0 || familyName) {
          const [family] = await db
            .insert(schema.families)
            .values({
              name: familyName,
              createdBy: user.id,
              timezone: body.timezone,
            })
            .returning({ id: schema.families.id });

          familyId = family.id;
          familyCreated = true;

          // Add the user as the first family member (admin)
          await db.insert(schema.familyMembers).values({
            familyId,
            userId: user.id,
            name: body.userName,
            role: "parent",
            color: MEMBER_COLORS[0],
          });

          // Add other family members from onboarding
          for (let i = 0; i < familyMembers.length; i++) {
            const member = familyMembers[i];
            await db.insert(schema.familyMembers).values({
              familyId,
              name: member.name,
              role: member.role || "child",
              age: member.age ?? null,
              birthday: member.birthday ?? null,
              school: member.school ?? null,
              allergies: member.allergies ?? [],
              dietaryPreferences: member.dietaryPreferences ?? [],
              notes: member.notes ?? null,
              color: MEMBER_COLORS[(i + 1) % MEMBER_COLORS.length],
            });
          }

          // Create a default grocery list
          await db.insert(schema.shoppingLists).values({
            familyId,
            name: "Groceries",
            createdBy: user.id,
          });

          // Link user to family
          await db
            .update(schema.user)
            .set({ familyId, familyRole: "admin" })
            .where(eq(schema.user.id, user.id));
        }

        // --- Build and save memory profile ---
        const profile = buildProfile(user.id, data.memoryProfile, {
          userName: body.userName,
          familyId,
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

        // Schedule a welcome reminder
        try {
          const welcomeRemindAt = computeNextDailyPing(body.dailyPingTime, body.timezone);
          if (welcomeRemindAt) {
            await createReminder({
              userId: user.id,
              title: "Anzi is ready for your family",
              body: `Hey ${body.userName}! I'm all set up and ready to help keep your family organized. Just tell me about upcoming events, tasks, or anything you need to remember 👋`,
              remindAt: welcomeRemindAt,
              timezone: body.timezone,
              source: "onboarding",
              metadata: { type: "welcome", allyName: body.allyName },
              ...(familyId ? { familyId } : {}),
            });
          }
        } catch (err) {
          console.warn("[onboarding/complete] Failed to create welcome reminders:", err);
        }

        set.status = 201;
        return {
          greeting: data.greeting,
          memoryProfileCreated: true,
          familyCreated,
          familyId,
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
