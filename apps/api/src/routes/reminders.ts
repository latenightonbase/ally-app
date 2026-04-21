import { Elysia, t } from "elysia";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { db, schema } from "../db";
import {
  createReminder,
  dismissReminder,
  updateReminderTime,
} from "../services/reminderService";

function normaliseTargetMemberIds(input: unknown): string[] {
  if (Array.isArray(input)) return (input as string[]).filter(Boolean);
  if (typeof input === "string" && input.length > 0) return [input];
  return [];
}

export const reminderRoutes = new Elysia({ prefix: "/api/v1/reminders" })
  .use(authMiddleware)

  // ─── List reminders (creator's + family-wide) ──────────────────
  .get(
    "/",
    async ({ query, user, set }) => {
      const [dbUser] = await db
        .select({ familyId: schema.user.familyId })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));

      const conditions = [] as ReturnType<typeof eq>[];

      if (dbUser?.familyId) {
        conditions.push(
          sql`(${schema.reminders.familyId} = ${dbUser.familyId} OR ${schema.reminders.userId} = ${user.id})` as any,
        );
      } else {
        conditions.push(eq(schema.reminders.userId, user.id));
      }

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
        .orderBy(asc(schema.reminders.remindAt))
        .limit(200);

      return {
        reminders: rows.map((r) => ({
          ...r,
          targetMemberIds: Array.isArray(r.targetMemberIds)
            ? (r.targetMemberIds as string[])
            : [],
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

  // ─── Manually create a reminder ────────────────────────────────
  .post(
    "/",
    async ({ body, user, set }) => {
      const [dbUser] = await db
        .select({
          familyId: schema.user.familyId,
          notificationPreferences: schema.user.notificationPreferences,
        })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));

      const defaultTimezone = dbUser?.notificationPreferences?.timezone;

      const remindAt = new Date(body.remindAt);
      if (Number.isNaN(remindAt.getTime())) {
        set.status = 400;
        return { error: "Invalid remindAt — must be ISO timestamp." };
      }

      const targetMemberIds = normaliseTargetMemberIds(body.targetMemberIds);

      if (targetMemberIds.length > 0) {
        if (!dbUser?.familyId) {
          set.status = 400;
          return { error: "Cannot mention family members without a family." };
        }
        const validMembers = await db
          .select({ id: schema.familyMembers.id })
          .from(schema.familyMembers)
          .where(eq(schema.familyMembers.familyId, dbUser.familyId));
        const validSet = new Set(validMembers.map((m) => m.id));
        const invalid = targetMemberIds.filter((id) => !validSet.has(id));
        if (invalid.length > 0) {
          set.status = 400;
          return {
            error: `Invalid family member IDs: ${invalid.join(", ")}`,
          };
        }
      }

      const reminderId = await createReminder({
        userId: user.id,
        title: body.title,
        body: body.body,
        remindAt,
        timezone: body.timezone ?? defaultTimezone ?? undefined,
        source: "user",
        familyId: dbUser?.familyId ?? undefined,
        targetMemberIds,
        metadata: {
          createdBy: user.id,
          remindAtISO: remindAt.toISOString(),
        },
      });

      const [created] = await db
        .select()
        .from(schema.reminders)
        .where(eq(schema.reminders.id, reminderId));

      return {
        reminder: {
          ...created,
          targetMemberIds: Array.isArray(created.targetMemberIds)
            ? (created.targetMemberIds as string[])
            : [],
          remindAt: created.remindAt?.toISOString(),
          notifiedAt: created.notifiedAt?.toISOString() ?? null,
          dismissedAt: created.dismissedAt?.toISOString() ?? null,
          createdAt: created.createdAt?.toISOString(),
        },
      };
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1 }),
        body: t.Optional(t.String()),
        remindAt: t.String(),
        timezone: t.Optional(t.String()),
        targetMemberIds: t.Optional(
          t.Union([t.Array(t.String()), t.String()]),
        ),
      }),
    },
  )

  // ─── Update a reminder ─────────────────────────────────────────
  .patch(
    "/:id",
    async ({ params, body, user, set }) => {
      const [dbUser] = await db
        .select({ familyId: schema.user.familyId })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));

      const existing = await db.query.reminders.findFirst({
        where: eq(schema.reminders.id, params.id),
      });

      if (!existing) {
        set.status = 404;
        return { error: "Reminder not found." };
      }

      const isCreator = existing.userId === user.id;
      const isFamilyMember =
        dbUser?.familyId && existing.familyId === dbUser.familyId;
      if (!isCreator && !isFamilyMember) {
        set.status = 403;
        return { error: "Not allowed to edit this reminder." };
      }

      // Status-only changes: handle dismissal via service helper for audit trail.
      if (body.status === "dismissed" && !body.remindAt && !body.title) {
        const ok = await dismissReminder(existing.userId, params.id);
        if (!ok) {
          set.status = 404;
          return { error: "Reminder not found or already dismissed." };
        }
      }

      const updates: Record<string, unknown> = {};
      if (body.title !== undefined) updates.title = body.title;
      if (body.body !== undefined) updates.body = body.body;
      if (body.timezone !== undefined) updates.timezone = body.timezone;
      if (body.status !== undefined && body.status !== "dismissed") {
        updates.status = body.status;
      }

      if (body.targetMemberIds !== undefined) {
        const next = normaliseTargetMemberIds(body.targetMemberIds);
        if (next.length > 0 && !dbUser?.familyId) {
          set.status = 400;
          return { error: "Cannot mention family members without a family." };
        }
        updates.targetMemberIds = next;
      }

      if (body.remindAt !== undefined) {
        const next = new Date(body.remindAt);
        if (Number.isNaN(next.getTime())) {
          set.status = 400;
          return { error: "Invalid remindAt — must be ISO timestamp." };
        }
        // Only safe for pending reminders; fall through to plain update otherwise.
        if (existing.status === "pending") {
          await updateReminderTime(params.id, next);
        } else {
          updates.remindAt = next;
        }
      }

      if (Object.keys(updates).length > 0) {
        await db
          .update(schema.reminders)
          .set(updates)
          .where(eq(schema.reminders.id, params.id));
      }

      const [fresh] = await db
        .select()
        .from(schema.reminders)
        .where(eq(schema.reminders.id, params.id));

      return {
        reminder: {
          ...fresh,
          targetMemberIds: Array.isArray(fresh.targetMemberIds)
            ? (fresh.targetMemberIds as string[])
            : [],
          remindAt: fresh.remindAt?.toISOString(),
          notifiedAt: fresh.notifiedAt?.toISOString() ?? null,
          dismissedAt: fresh.dismissedAt?.toISOString() ?? null,
          createdAt: fresh.createdAt?.toISOString(),
        },
      };
    },
    {
      body: t.Object({
        title: t.Optional(t.String()),
        body: t.Optional(t.Nullable(t.String())),
        remindAt: t.Optional(t.String()),
        timezone: t.Optional(t.String()),
        targetMemberIds: t.Optional(
          t.Union([t.Array(t.String()), t.Null(), t.String()]),
        ),
        status: t.Optional(
          t.Union([
            t.Literal("pending"),
            t.Literal("sent"),
            t.Literal("dismissed"),
          ]),
        ),
      }),
    },
  )

  // ─── Delete a reminder ─────────────────────────────────────────
  .delete("/:id", async ({ params, user, set }) => {
    const existing = await db.query.reminders.findFirst({
      where: eq(schema.reminders.id, params.id),
    });

    if (!existing) {
      set.status = 404;
      return { error: "Reminder not found." };
    }

    if (existing.userId !== user.id) {
      set.status = 403;
      return { error: "Only the creator can delete this reminder." };
    }

    await db.delete(schema.reminders).where(eq(schema.reminders.id, params.id));

    return { deleted: true };
  });
