import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { sendPushNotification } from "../services/notifications";
import { db, schema } from "../db";
import { and, eq, gte, lte, isNull, desc, asc } from "drizzle-orm";
import crypto from "crypto";

export const familyRoutes = new Elysia({ prefix: "/api/v1/family" })
  .use(authMiddleware)

  // ─── Get current user's family ─────────────────────────────────
  .get("/", async ({ user, set }) => {
    // Look up user's familyId
    const [dbUser] = await db
      .select({ familyId: schema.user.familyId })
      .from(schema.user)
      .where(eq(schema.user.id, user.id));

    if (!dbUser?.familyId) {
      set.status = 404;
      return { error: "No family found. Complete onboarding first." };
    }

    const [family] = await db
      .select()
      .from(schema.families)
      .where(eq(schema.families.id, dbUser.familyId));

    const members = await db
      .select()
      .from(schema.familyMembers)
      .where(eq(schema.familyMembers.familyId, dbUser.familyId));

    return { family, members };
  })

  // ─── Create a family ───────────────────────────────────────────
  .post(
    "/",
    async ({ body, user }) => {
      const { name, timezone, members } = body;

      // Create family
      const [family] = await db
        .insert(schema.families)
        .values({
          name,
          createdBy: user.id,
          timezone: timezone ?? "America/New_York",
        })
        .returning();

      // Link user to this family
      await db
        .update(schema.user)
        .set({ familyId: family.id, familyRole: "admin" })
        .where(eq(schema.user.id, user.id));

      // Create family members
      if (members?.length) {
        await db.insert(schema.familyMembers).values(
          members.map((m: any) => ({
            familyId: family.id,
            name: m.name,
            role: m.role ?? "child",
            age: m.age ?? null,
            birthday: m.birthday ?? null,
            school: m.school ?? null,
            allergies: m.allergies ?? [],
            dietaryPreferences: m.dietaryPreferences ?? [],
          })),
        );
      }

      // Also add the user themselves as a parent member
      await db.insert(schema.familyMembers).values({
        familyId: family.id,
        userId: user.id,
        name: (await db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, user.id)))[0]?.name ?? "Me",
        role: "parent",
      });

      // Create a default grocery shopping list
      await db.insert(schema.shoppingLists).values({
        familyId: family.id,
        name: "Groceries",
        createdBy: user.id,
      });

      const allMembers = await db
        .select()
        .from(schema.familyMembers)
        .where(eq(schema.familyMembers.familyId, family.id));

      return { family, members: allMembers };
    },
    {
      body: t.Object({
        name: t.String(),
        timezone: t.Optional(t.String()),
        members: t.Optional(
          t.Array(
            t.Object({
              name: t.String(),
              role: t.Optional(t.String()),
              age: t.Optional(t.Number()),
              birthday: t.Optional(t.String()),
              school: t.Optional(t.String()),
              allergies: t.Optional(t.Array(t.String())),
              dietaryPreferences: t.Optional(t.Array(t.String())),
            }),
          ),
        ),
      }),
    },
  )

  // ─── Invite another user to the family ─────────────────────────
  .post(
    "/invite",
    async ({ body, user, set }) => {
      const [dbUser] = await db
        .select({ familyId: schema.user.familyId, familyRole: schema.user.familyRole })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));

      if (!dbUser?.familyId) {
        set.status = 404;
        return { error: "No family found." };
      }

      if (dbUser.familyRole !== "admin") {
        set.status = 403;
        return { error: "Only the family admin can send invites." };
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const [invite] = await db
        .insert(schema.familyInvites)
        .values({
          familyId: dbUser.familyId,
          invitedBy: user.id,
          email: body.email,
          role: (body.role as any) ?? "member",
          token,
          expiresAt,
        })
        .returning();

      const deepLink = `ally-app://invite/${token}`;

      return { invite, inviteLink: deepLink };
    },
    {
      body: t.Object({
        email: t.String(),
        role: t.Optional(t.String()),
      }),
    },
  )

  // ─── Accept a family invite ────────────────────────────────────
  .post(
    "/invite/accept",
    async ({ body, user, set }) => {
      const [currentUser] = await db
        .select({ familyId: schema.user.familyId })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));

      if (currentUser?.familyId) {
        set.status = 409;
        return { error: "You already belong to a family. Leave your current family first." };
      }

      const [invite] = await db
        .select()
        .from(schema.familyInvites)
        .where(
          and(
            eq(schema.familyInvites.token, body.token),
            eq(schema.familyInvites.status, "pending"),
          ),
        );

      if (!invite) {
        set.status = 404;
        return { error: "Invalid or expired invite." };
      }

      if (new Date() > invite.expiresAt) {
        await db
          .update(schema.familyInvites)
          .set({ status: "expired" })
          .where(eq(schema.familyInvites.id, invite.id));
        set.status = 410;
        return { error: "Invite expired." };
      }

      // Link user to family
      await db
        .update(schema.user)
        .set({ familyId: invite.familyId, familyRole: invite.role })
        .where(eq(schema.user.id, user.id));

      // Create a member record
      await db.insert(schema.familyMembers).values({
        familyId: invite.familyId,
        userId: user.id,
        name: (await db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, user.id)))[0]?.name ?? "Member",
        role: "parent",
      });

      // Mark invite as accepted
      await db
        .update(schema.familyInvites)
        .set({ status: "accepted" })
        .where(eq(schema.familyInvites.id, invite.id));

      // Notify the inviter that someone joined
      const inviter = await db.query.user.findFirst({
        where: eq(schema.user.id, invite.invitedBy),
        columns: { expoPushToken: true, allyName: true },
      });
      const joinerName = (
        await db
          .select({ name: schema.user.name })
          .from(schema.user)
          .where(eq(schema.user.id, user.id))
      )[0]?.name ?? "Someone";

      if (inviter?.expoPushToken) {
        sendPushNotification(
          inviter.expoPushToken,
          inviter.allyName ?? "Anzi",
          `${joinerName} joined your family on Anzi! 🎉`,
          { type: "family_invite_accepted" },
        ).catch(() => {});
      }

      return { joined: true, familyId: invite.familyId };
    },
    {
      body: t.Object({
        token: t.String(),
      }),
    },
  )

  // ─── Dashboard: combined family overview ───────────────────────
  .get("/dashboard", async ({ user, set }) => {
    const [dbUser] = await db
      .select({ familyId: schema.user.familyId })
      .from(schema.user)
      .where(eq(schema.user.id, user.id));

    if (!dbUser?.familyId) {
      set.status = 404;
      return { error: "No family found." };
    }

    const familyId = dbUser.familyId;
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const [family, members, todayEvents, pendingTasks, shoppingLists, todayMeals] =
      await Promise.all([
        db
          .select()
          .from(schema.families)
          .where(eq(schema.families.id, familyId))
          .then((rows) => rows[0]),
        db
          .select()
          .from(schema.familyMembers)
          .where(eq(schema.familyMembers.familyId, familyId)),
        db
          .select()
          .from(schema.calendarEvents)
          .where(
            and(
              eq(schema.calendarEvents.familyId, familyId),
              gte(schema.calendarEvents.startTime, dayStart),
              lte(schema.calendarEvents.startTime, dayEnd),
            ),
          )
          .orderBy(asc(schema.calendarEvents.startTime)),
        db
          .select()
          .from(schema.tasks)
          .where(
            and(
              eq(schema.tasks.familyId, familyId),
              eq(schema.tasks.status, "pending"),
            ),
          )
          .orderBy(asc(schema.tasks.dueDate)),
        db
          .select()
          .from(schema.shoppingLists)
          .where(eq(schema.shoppingLists.familyId, familyId)),
        db
          .select()
          .from(schema.mealPlans)
          .where(
            and(
              eq(schema.mealPlans.familyId, familyId),
              eq(schema.mealPlans.date, now.toISOString().split("T")[0]),
            ),
          ),
      ]);

    // Get item counts for shopping lists
    const listsWithCounts = await Promise.all(
      shoppingLists.map(async (list) => {
        const items = await db
          .select()
          .from(schema.shoppingListItems)
          .where(eq(schema.shoppingListItems.listId, list.id));
        return {
          ...list,
          items,
          uncheckedCount: items.filter((i) => !i.checked).length,
        };
      }),
    );

    return {
      family,
      members,
      todayEvents,
      pendingTasks,
      shoppingLists: listsWithCounts,
      todayMeals,
    };
  });
