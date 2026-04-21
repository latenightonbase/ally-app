import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { sendPushNotification } from "../services/notifications";
import { sendFamilyInviteEmail } from "../services/email";
import { buildInviteDeepLink, buildPublicInviteUrl } from "../lib/inviteWeb";
import { db, schema } from "../db";
import { and, eq, gte, lte, isNull, desc, asc, sql } from "drizzle-orm";
import crypto from "crypto";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

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
      const { name, timezone, artworkId, inviteEmails, members } = body;

      // Create family
      const [family] = await db
        .insert(schema.families)
        .values({
          name,
          createdBy: user.id,
          timezone: timezone ?? "America/New_York",
          artworkId: artworkId ?? null,
          inviteCode: generateInviteCode(),
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
      const inviterName =
        (await db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, user.id)))[0]?.name ?? "Me";
      await db.insert(schema.familyMembers).values({
        familyId: family.id,
        userId: user.id,
        name: inviterName,
        role: "parent",
      });

      // Create a default grocery shopping list
      await db.insert(schema.shoppingLists).values({
        familyId: family.id,
        name: "Groceries",
        createdBy: user.id,
      });

      // Send invite emails (fire-and-forget)
      const uniqueEmails = Array.from(
        new Set(
          (inviteEmails ?? [])
            .map((e) => e.trim().toLowerCase())
            .filter((e) => e.length > 0),
        ),
      );
      if (uniqueEmails.length && family.inviteCode) {
        // Record pending invites in DB so admins can track them
        const token = () => crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        await db
          .insert(schema.familyInvites)
          .values(
            uniqueEmails.map((email) => ({
              familyId: family.id,
              invitedBy: user.id,
              email,
              role: "member" as const,
              token: token(),
              expiresAt,
            })),
          )
          .onConflictDoNothing();

        for (const email of uniqueEmails) {
          sendFamilyInviteEmail({
            to: email,
            familyName: family.name,
            inviterName,
            inviteCode: family.inviteCode,
          }).catch((err) =>
            console.warn(`[family/create] invite email to ${email} failed:`, err),
          );
        }
      }

      const allMembers = await db
        .select()
        .from(schema.familyMembers)
        .where(eq(schema.familyMembers.familyId, family.id));

      return { family, members: allMembers, invitedEmails: uniqueEmails };
    },
    {
      body: t.Object({
        name: t.String(),
        timezone: t.Optional(t.String()),
        artworkId: t.Optional(t.String()),
        inviteEmails: t.Optional(t.Array(t.String())),
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

      const deepLink = buildInviteDeepLink(token);
      const inviteLink = buildPublicInviteUrl(token) ?? deepLink;

      return { invite, inviteLink, deepLink };
    },
    {
      body: t.Object({
        email: t.String(),
        role: t.Optional(t.String()),
      }),
    },
  )

  // ─── Batch invite people to the family by email ───────────────
  .post(
    "/invite-emails",
    async ({ body, user, set }) => {
      const [dbUser] = await db
        .select({ familyId: schema.user.familyId, familyRole: schema.user.familyRole, name: schema.user.name })
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

      const uniqueEmails = Array.from(
        new Set(
          body.emails.map((e) => e.trim().toLowerCase()).filter((e) => e.length > 0),
        ),
      );

      if (uniqueEmails.length === 0) {
        return { sent: [], skipped: [] };
      }

      const [family] = await db
        .select({ id: schema.families.id, name: schema.families.name, inviteCode: schema.families.inviteCode })
        .from(schema.families)
        .where(eq(schema.families.id, dbUser.familyId));

      if (!family) {
        set.status = 404;
        return { error: "Family not found." };
      }

      let inviteCode = family.inviteCode;
      if (!inviteCode) {
        inviteCode = generateInviteCode();
        await db
          .update(schema.families)
          .set({ inviteCode })
          .where(eq(schema.families.id, family.id));
      }

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      await db
        .insert(schema.familyInvites)
        .values(
          uniqueEmails.map((email) => ({
            familyId: family.id,
            invitedBy: user.id,
            email,
            role: "member" as const,
            token: crypto.randomBytes(32).toString("hex"),
            expiresAt,
          })),
        )
        .onConflictDoNothing();

      const inviterName = dbUser.name ?? "A family member";
      const results = await Promise.all(
        uniqueEmails.map((email) =>
          sendFamilyInviteEmail({
            to: email,
            familyName: family.name,
            inviterName,
            inviteCode: inviteCode!,
          })
            .then((ok) => ({ email, ok }))
            .catch(() => ({ email, ok: false })),
        ),
      );

      return {
        sent: results.filter((r) => r.ok).map((r) => r.email),
        skipped: results.filter((r) => !r.ok).map((r) => r.email),
      };
    },
    {
      body: t.Object({
        emails: t.Array(t.String()),
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

  // ─── Get family invite code ────────────────────────────────────
  .get("/invite-code", async ({ user, set }) => {
    const [dbUser] = await db
      .select({ familyId: schema.user.familyId })
      .from(schema.user)
      .where(eq(schema.user.id, user.id));

    if (!dbUser?.familyId) {
      set.status = 404;
      return { error: "No family found." };
    }

    const [family] = await db
      .select({ inviteCode: schema.families.inviteCode })
      .from(schema.families)
      .where(eq(schema.families.id, dbUser.familyId));

    if (!family?.inviteCode) {
      // Backfill: generate a code if the family doesn't have one yet
      const code = generateInviteCode();
      await db
        .update(schema.families)
        .set({ inviteCode: code })
        .where(eq(schema.families.id, dbUser.familyId));
      return { code };
    }

    return { code: family.inviteCode };
  })

  // ─── Regenerate invite code (admin only) ───────────────────────
  .post("/invite-code/regenerate", async ({ user, set }) => {
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
      return { error: "Only the family admin can regenerate the invite code." };
    }

    const code = generateInviteCode();
    await db
      .update(schema.families)
      .set({ inviteCode: code })
      .where(eq(schema.families.id, dbUser.familyId));

    return { code };
  })

  // ─── Join a family by invite code ──────────────────────────────
  .post(
    "/join",
    async ({ body, user, set }) => {
      const [currentUser] = await db
        .select({ familyId: schema.user.familyId })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));

      if (currentUser?.familyId) {
        set.status = 409;
        return { error: "You already belong to a family. Leave your current family first." };
      }

      const code = body.code.trim().toUpperCase();
      const [family] = await db
        .select()
        .from(schema.families)
        .where(eq(schema.families.inviteCode, code));

      if (!family) {
        set.status = 404;
        return { error: "Invalid invite code. Check the code and try again." };
      }

      // Link user to family
      await db
        .update(schema.user)
        .set({ familyId: family.id, familyRole: "member" })
        .where(eq(schema.user.id, user.id));

      // Create a family member record
      const userName = (await db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, user.id)))[0]?.name ?? "Member";
      await db.insert(schema.familyMembers).values({
        familyId: family.id,
        userId: user.id,
        name: userName,
        role: "parent",
      });

      return { joined: true, familyId: family.id };
    },
    {
      body: t.Object({
        code: t.String(),
      }),
    },
  )

  // ─── Reminders: all reminders for the family in a date range ──
  .get(
    "/reminders",
    async ({ query, user, set }) => {
      const [dbUser] = await db
        .select({ familyId: schema.user.familyId })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));

      if (!dbUser?.familyId) {
        set.status = 404;
        return { error: "No family found." };
      }

      const conditions = [
        sql`(${schema.reminders.familyId} = ${dbUser.familyId} OR ${schema.reminders.userId} = ${user.id})`,
      ];

      if (query.start) {
        conditions.push(gte(schema.reminders.remindAt, new Date(query.start)));
      }
      if (query.end) {
        conditions.push(lte(schema.reminders.remindAt, new Date(query.end)));
      }
      if (query.status) {
        conditions.push(
          eq(
            schema.reminders.status,
            query.status as "pending" | "sent" | "dismissed",
          ),
        );
      }

      const rows = await db
        .select()
        .from(schema.reminders)
        .where(and(...conditions))
        .orderBy(asc(schema.reminders.remindAt));

      return {
        reminders: rows.map((r) => ({
          ...r,
          remindAt: r.remindAt?.toISOString(),
          notifiedAt: r.notifiedAt?.toISOString() ?? null,
          dismissedAt: r.dismissedAt?.toISOString() ?? null,
          createdAt: r.createdAt?.toISOString(),
        })),
      };
    },
    {
      query: t.Object({
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
        status: t.Optional(t.String()),
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

    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    sevenDaysFromNow.setHours(23, 59, 59, 999);

    const [family, members, todayEvents, pendingTasks, upcomingReminders, shoppingLists, todayMeals] =
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
          .from(schema.reminders)
          .where(
            and(
              sql`(${schema.reminders.familyId} = ${familyId} OR ${schema.reminders.userId} = ${user.id})`,
              eq(schema.reminders.status, "pending"),
              gte(schema.reminders.remindAt, now),
              lte(schema.reminders.remindAt, sevenDaysFromNow),
            ),
          )
          .orderBy(asc(schema.reminders.remindAt)),
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
      upcomingReminders,
      shoppingLists: listsWithCounts,
      todayMeals,
    };
  });
