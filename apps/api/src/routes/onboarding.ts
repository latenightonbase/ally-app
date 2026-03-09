import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { processOnboarding, generateOnboardingFollowups, processOnboardingConversation } from "../ai/onboarding";
import { AIError } from "../ai/client";
import { updateProfile } from "../services/memory";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import type { MemoryProfile } from "@ally/shared";

export const onboardingRoutes = new Elysia({ prefix: "/api/v1" })
  .use(authMiddleware)
  // Legacy endpoint — kept for backward compatibility
  .post(
    "/onboarding",
    async ({ body, user, set }) => {
      let data;
      try {
        ({ data } = await processOnboarding(body.answers));
      } catch (e) {
        if (e instanceof AIError) {
          set.status = e.statusCode;
          throw new Error(e.message);
        }
        throw e;
      }

      const profile: MemoryProfile = {
        userId: user.id,
        version: 2,
        personalInfo: {
          preferredName: data.memoryProfile.personalInfo?.preferredName ?? null,
          fullName: data.memoryProfile.personalInfo?.fullName ?? null,
          age: null,
          birthday: null,
          location: data.memoryProfile.personalInfo?.location ?? null,
          livingSituation:
            data.memoryProfile.personalInfo?.livingSituation ?? null,
          other: {},
        },
        relationships: data.memoryProfile.relationships ?? [],
        work: {
          role: data.memoryProfile.work?.role ?? null,
          company: data.memoryProfile.work?.company ?? null,
          companyType: null,
          currentProjects: [],
          currentGoals: data.memoryProfile.work?.currentGoals ?? [],
          stressors: data.memoryProfile.work?.stressors ?? [],
          colleagues: [],
        },
        health: {
          fitnessGoals: [],
          currentRoutine: null,
          sleepNotes: null,
          dietNotes: null,
          mentalHealthNotes: null,
          other: {},
        },
        interests: [],
        goals: data.memoryProfile.goals ?? [],
        emotionalPatterns: {
          primaryStressors:
            data.memoryProfile.emotionalPatterns?.primaryStressors ?? [],
          copingMechanisms:
            data.memoryProfile.emotionalPatterns?.copingMechanisms ?? [],
          moodTrends: [],
          recurringThemes: [],
          sensitivities: [],
        },
        pendingFollowups: [],
        updatedAt: new Date().toISOString(),
      };

      await updateProfile(user.id, profile);

      set.status = 201;
      return {
        greeting: data.greeting,
        memoryProfileCreated: true,
      };
    },
    {
      body: t.Object({
        answers: t.Object({
          nameAndGreeting: t.String(),
          lifeContext: t.String(),
          currentFocus: t.String(),
          stressAndSupport: t.String(),
          allyExpectations: t.String(),
        }),
      }),
    },
  )
  // Dynamic onboarding: generate followup questions
  .post(
    "/onboarding/followup",
    async ({ body, user, set }) => {
      try {
        const { data } = await generateOnboardingFollowups({
          userName: body.userName,
          allyName: body.allyName,
          conversation: body.conversation,
          dynamicRound: body.dynamicRound,
        });

        // Incrementally save memory updates if present
        if (data.memoryUpdates && Object.keys(data.memoryUpdates).length > 0) {
          try {
            await updateProfile(user.id, data.memoryUpdates as Partial<MemoryProfile>);
          } catch {
            // Non-critical — don't fail the request if incremental save fails
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
  // Dynamic onboarding: finalize and create full memory profile
  .post(
    "/onboarding/complete",
    async ({ body, user, set }) => {
      try {
        const { data } = await processOnboardingConversation({
          userName: body.userName,
          allyName: body.allyName,
          conversation: body.conversation,
        });

        const profile: MemoryProfile = {
          userId: user.id,
          version: 2,
          personalInfo: {
            preferredName: data.memoryProfile.personalInfo?.preferredName ?? body.userName,
            fullName: data.memoryProfile.personalInfo?.fullName ?? null,
            age: null,
            birthday: null,
            location: data.memoryProfile.personalInfo?.location ?? null,
            livingSituation: data.memoryProfile.personalInfo?.livingSituation ?? null,
            other: {},
          },
          relationships: data.memoryProfile.relationships ?? [],
          work: {
            role: data.memoryProfile.work?.role ?? null,
            company: data.memoryProfile.work?.company ?? null,
            companyType: null,
            currentProjects: [],
            currentGoals: data.memoryProfile.work?.currentGoals ?? [],
            stressors: data.memoryProfile.work?.stressors ?? [],
            colleagues: [],
          },
          health: {
            fitnessGoals: data.memoryProfile.health?.fitnessGoals ?? [],
            currentRoutine: null,
            sleepNotes: null,
            dietNotes: null,
            mentalHealthNotes: data.memoryProfile.health?.mentalHealthNotes ?? null,
            other: {},
          },
          interests: data.memoryProfile.interests ?? [],
          goals: data.memoryProfile.goals ?? [],
          emotionalPatterns: {
            primaryStressors: data.memoryProfile.emotionalPatterns?.primaryStressors ?? [],
            copingMechanisms: data.memoryProfile.emotionalPatterns?.copingMechanisms ?? [],
            moodTrends: [],
            recurringThemes: [],
            sensitivities: data.memoryProfile.emotionalPatterns?.sensitivities ?? [],
          },
          pendingFollowups: [],
          updatedAt: new Date().toISOString(),
        };

        await updateProfile(user.id, profile);

        // Save daily ping preference and ally name on the user record
        await db
          .update(schema.user)
          .set({
            notificationPreferences: {
              dailyPingTime: body.dailyPingTime,
              timezone: body.timezone,
            },
            allyName: body.allyName,
          })
          .where(eq(schema.user.id, user.id));

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
