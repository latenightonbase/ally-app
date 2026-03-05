import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { processOnboarding } from "../ai/onboarding";
import { AIError } from "../ai/client";
import { updateProfile } from "../services/memory";
import type { MemoryProfile } from "@ally/shared";

export const onboardingRoutes = new Elysia({ prefix: "/api/v1" })
  .use(authMiddleware)
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
  );
