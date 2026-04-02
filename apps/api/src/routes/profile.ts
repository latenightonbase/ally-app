import { Elysia, t } from "elysia";
import { eq, and, isNull, gte, lte, desc } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { getOrCreateProfile } from "../services/memory";
import { db, schema } from "../db";
import type { NotificationPreferences } from "../db/auth-schema";

/**
 * GET /api/v1/profile/you
 *
 * Returns the aggregated "You" screen data — a living portrait of the user
 * as Ally understands them. All tiers (free_trial, basic, premium) get the
 * full profile. Weekly insights and proactive features are still Premium-only,
 * but the You screen itself is fully accessible to everyone.
 */
export const profileRoutes = new Elysia({ prefix: "/api/v1" })
  .use(authMiddleware)
  .get("/profile/you", async ({ user }) => {
    const tier = user.tier as string;
    const now = new Date();
    const sevenDaysOut = new Date();
    sevenDaysOut.setDate(now.getDate() + 7);

    const [profile, upcomingEventsRaw] = await Promise.all([
      getOrCreateProfile(user.id),
      db.query.memoryEvents.findMany({
        where: and(
          eq(schema.memoryEvents.userId, user.id),
          isNull(schema.memoryEvents.completedAt),
          gte(schema.memoryEvents.eventDate, now),
          lte(schema.memoryEvents.eventDate, sevenDaysOut),
        ),
        orderBy: [schema.memoryEvents.eventDate],
        limit: 5,
        columns: { id: true, content: true, eventDate: true, context: true },
      }),
    ]);

    const upcomingEvents = upcomingEventsRaw.map((e) => ({
      id: e.id,
      content: e.content,
      eventDate: e.eventDate.toISOString(),
      context: e.context,
    }));

    const recentEpisodes = await db.query.memoryEpisodes.findMany({
      where: and(
        eq(schema.memoryEpisodes.userId, user.id),
        isNull(schema.memoryEpisodes.consolidatedAt),
      ),
      orderBy: [desc(schema.memoryEpisodes.createdAt)],
      limit: 10,
      columns: { id: true, content: true, emotion: true, category: true, createdAt: true },
    });

    const completenessSignal = computeCompletenessSignal(profile);

    const relationships = Array.isArray(profile.relationships) ? profile.relationships : [];
    const goals = Array.isArray(profile.goals) ? profile.goals : [];
    const ep = profile.emotionalPatterns;

    return {
      personalInfo: profile.personalInfo,
      relationships,
      goals: goals.filter((g) => g.status === "active"),
      upcomingEvents,
      tier,
      emotionalPatterns: {
        primaryStressors: Array.isArray(ep?.primaryStressors) ? ep.primaryStressors : [],
        copingMechanisms: Array.isArray(ep?.copingMechanisms) ? ep.copingMechanisms : [],
        moodTrends: Array.isArray(ep?.moodTrends) ? ep.moodTrends : [],
        recurringThemes: Array.isArray(ep?.recurringThemes) ? ep.recurringThemes : [],
        sensitivities: Array.isArray(ep?.sensitivities) ? ep.sensitivities : [],
      },
      dynamicAttributes: profile.dynamicAttributes ?? {},
      recentEpisodes: recentEpisodes.map((e) => ({
        id: e.id,
        content: e.content,
        emotion: e.emotion,
        category: e.category,
        date: e.createdAt.toISOString(),
      })),
      completenessSignal,
    };
  })

  /**
   * GET /api/v1/users/profile
   *
   * Returns the current user's editable profile preferences — used by the
   * Settings screen to populate Name, Ally Name, Occupation, and notification
   * time fields.
   */
  .get("/users/profile", async ({ user }) => {
    const userRow = await db.query.user.findFirst({
      where: eq(schema.user.id, user.id),
      columns: {
        name: true,
        email: true,
        allyName: true,
        notificationPreferences: true,
        tier: true,
      },
    });

    if (!userRow) {
      return {
        name: "",
        email: user.email,
        allyName: "Anzi",
        dailyPingTime: null,
        timezone: null,
        occupation: null,
        tier: user.tier,
      };
    }

    const profile = await db.query.memoryProfiles.findFirst({
      where: eq(schema.memoryProfiles.userId, user.id),
      columns: { profile: true },
    });

    return {
      name: userRow.name,
      email: userRow.email,
      allyName: userRow.allyName ?? "Anzi",
      dailyPingTime: userRow.notificationPreferences?.dailyPingTime ?? null,
      timezone: userRow.notificationPreferences?.timezone ?? null,
      proactiveCheckins: userRow.notificationPreferences?.proactiveCheckins ?? false,
      checkinFrequency: userRow.notificationPreferences?.checkinFrequency ?? "medium",
      quietHoursStart: userRow.notificationPreferences?.quietHoursStart ?? "21:00",
      quietHoursEnd: userRow.notificationPreferences?.quietHoursEnd ?? "09:00",
      occupation: profile?.profile?.work?.role ?? null,
      tier: userRow.tier ?? user.tier,
    };
  })

  /**
   * PATCH /api/v1/users/profile
   *
   * Updates editable user profile fields. All fields are optional — only the
   * provided fields are updated. Syncs name/occupation changes into the
   * memory profile so the AI hot tier stays accurate.
   */
  .patch(
    "/users/profile",
    async ({ user, body }) => {
      const { name, allyName, dailyPingTime, timezone, occupation, proactiveCheckins, checkinFrequency, quietHoursStart, quietHoursEnd } = body;

      type UserUpdate = {
        name?: string;
        allyName?: string;
        notificationPreferences?: NotificationPreferences;
      };
      const userFieldsToUpdate: UserUpdate = {};

      if (name !== undefined) userFieldsToUpdate.name = name;
      if (allyName !== undefined) userFieldsToUpdate.allyName = allyName;

      // Merge notification preferences — don't overwrite unrelated fields
      if (dailyPingTime !== undefined || timezone !== undefined || proactiveCheckins !== undefined || checkinFrequency !== undefined || quietHoursStart !== undefined || quietHoursEnd !== undefined) {
        const currentUser = await db.query.user.findFirst({
          where: eq(schema.user.id, user.id),
          columns: { notificationPreferences: true },
        });
        const current: NotificationPreferences =
          currentUser?.notificationPreferences ?? {
            dailyPingTime: "09:00",
            timezone: "UTC",
          };
        const merged: NotificationPreferences = {
          dailyPingTime: dailyPingTime ?? current.dailyPingTime,
          timezone: timezone ?? current.timezone,
          proactiveCheckins: proactiveCheckins ?? current.proactiveCheckins,
          checkinFrequency: checkinFrequency ?? current.checkinFrequency,
          quietHoursStart: quietHoursStart ?? current.quietHoursStart,
          quietHoursEnd: quietHoursEnd ?? current.quietHoursEnd,
        };
        userFieldsToUpdate.notificationPreferences = merged;
      }

      if (Object.keys(userFieldsToUpdate).length > 0) {
        await db
          .update(schema.user)
          .set(userFieldsToUpdate)
          .where(eq(schema.user.id, user.id));
      }

      // Sync name and/or occupation into the memory profile (hot tier)
      if (name !== undefined || occupation !== undefined) {
        const memProfile = await getOrCreateProfile(user.id);

        if (name !== undefined) {
          memProfile.personalInfo.preferredName = name;
        }
        if (occupation !== undefined) {
          memProfile.work = { ...memProfile.work, role: occupation };
        }

        await db
          .update(schema.memoryProfiles)
          .set({ profile: memProfile, updatedAt: new Date() })
          .where(eq(schema.memoryProfiles.userId, user.id));
      }

      // Read back the latest state to return consistent data
      const updatedUser = await db.query.user.findFirst({
        where: eq(schema.user.id, user.id),
        columns: {
          name: true,
          email: true,
          allyName: true,
          notificationPreferences: true,
          tier: true,
        },
      });

      const updatedProfile = await db.query.memoryProfiles.findFirst({
        where: eq(schema.memoryProfiles.userId, user.id),
        columns: { profile: true },
      });

      return {
        updated: true,
        name: updatedUser?.name ?? "",
        email: updatedUser?.email ?? user.email,
        allyName: updatedUser?.allyName ?? "Anzi",
        dailyPingTime:
          updatedUser?.notificationPreferences?.dailyPingTime ?? null,
        timezone: updatedUser?.notificationPreferences?.timezone ?? null,
        proactiveCheckins: updatedUser?.notificationPreferences?.proactiveCheckins ?? false,
        checkinFrequency: updatedUser?.notificationPreferences?.checkinFrequency ?? "medium",
        quietHoursStart: updatedUser?.notificationPreferences?.quietHoursStart ?? "21:00",
        quietHoursEnd: updatedUser?.notificationPreferences?.quietHoursEnd ?? "09:00",
        occupation: updatedProfile?.profile?.work?.role ?? null,
        tier: updatedUser?.tier ?? user.tier,
      };
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
        allyName: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
        dailyPingTime: t.Optional(t.String()),
        timezone: t.Optional(t.String()),
        occupation: t.Optional(t.String({ maxLength: 100 })),
        proactiveCheckins: t.Optional(t.Boolean()),
        checkinFrequency: t.Optional(t.Union([t.Literal("low"), t.Literal("medium"), t.Literal("high")])),
        quietHoursStart: t.Optional(t.String()),
        quietHoursEnd: t.Optional(t.String()),
      }),
    },
  );

function computeCompletenessSignal(
  profile: Awaited<ReturnType<typeof getOrCreateProfile>>,
): Record<string, "clear" | "emerging" | "fuzzy"> {
  return {
    work: profile.work?.role ? "clear" : profile.work?.stressors?.length ? "emerging" : "fuzzy",
    relationships:
      profile.relationships?.length >= 3
        ? "clear"
        : profile.relationships?.length >= 1
          ? "emerging"
          : "fuzzy",
    health:
      profile.health?.currentRoutine || profile.health?.fitnessGoals?.length
        ? "emerging"
        : "fuzzy",
    emotionalPatterns:
      profile.emotionalPatterns?.primaryStressors?.length >= 2
        ? "clear"
        : profile.emotionalPatterns?.primaryStressors?.length === 1
          ? "emerging"
          : "fuzzy",
    interests: profile.interests?.length >= 3 ? "clear" : profile.interests?.length >= 1 ? "emerging" : "fuzzy",
  };
}
