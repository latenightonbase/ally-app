import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { db, schema } from "../db";
import { and, eq, gte, lte, isNull, asc, desc } from "drizzle-orm";

export const calendarRoutes = new Elysia({ prefix: "/api/v1/calendar" })
  .use(authMiddleware)

  // ─── Get events for a date range ───────────────────────────────
  .get(
    "/events",
    async ({ query, user, set }) => {
      const [dbUser] = await db
        .select({ familyId: schema.user.familyId })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));

      if (!dbUser?.familyId) {
        set.status = 404;
        return { error: "No family found." };
      }

      const start = new Date(query.start);
      const end = new Date(query.end);

      const events = await db
        .select()
        .from(schema.calendarEvents)
        .where(
          and(
            eq(schema.calendarEvents.familyId, dbUser.familyId),
            gte(schema.calendarEvents.startTime, start),
            lte(schema.calendarEvents.startTime, end),
          ),
        )
        .orderBy(asc(schema.calendarEvents.startTime));

      // Resolve member names
      const members = await db
        .select({ id: schema.familyMembers.id, name: schema.familyMembers.name, color: schema.familyMembers.color })
        .from(schema.familyMembers)
        .where(eq(schema.familyMembers.familyId, dbUser.familyId));

      const memberMap = new Map(members.map((m) => [m.id, m]));

      return {
        events: events.map((e) => ({
          ...e,
          startTime: e.startTime?.toISOString(),
          endTime: e.endTime?.toISOString(),
          completedAt: e.completedAt?.toISOString(),
          createdAt: e.createdAt?.toISOString(),
          updatedAt: e.updatedAt?.toISOString(),
          assignedMembers: (e.assignedTo as string[])?.map((id) => memberMap.get(id)).filter(Boolean) ?? [],
        })),
      };
    },
    {
      query: t.Object({
        start: t.String(),
        end: t.String(),
      }),
    },
  )

  // ─── Create event ──────────────────────────────────────────────
  .post(
    "/events",
    async ({ body, user, set }) => {
      const [dbUser] = await db
        .select({ familyId: schema.user.familyId })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));

      if (!dbUser?.familyId) {
        set.status = 404;
        return { error: "No family found." };
      }

      const [event] = await db
        .insert(schema.calendarEvents)
        .values({
          familyId: dbUser.familyId,
          createdBy: user.id,
          title: body.title,
          description: body.description ?? null,
          startTime: new Date(body.startTime),
          endTime: body.endTime ? new Date(body.endTime) : null,
          allDay: body.allDay ?? false,
          location: body.location ?? null,
          recurrence: (body.recurrence as any) ?? "none",
          assignedTo: body.assignedTo ?? [],
          remindBefore: body.remindBefore ?? 30,
          color: body.color ?? null,
        })
        .returning();

      return { event };
    },
    {
      body: t.Object({
        title: t.String(),
        startTime: t.String(),
        endTime: t.Optional(t.String()),
        allDay: t.Optional(t.Boolean()),
        location: t.Optional(t.String()),
        recurrence: t.Optional(t.String()),
        assignedTo: t.Optional(t.Array(t.String())),
        remindBefore: t.Optional(t.Number()),
        color: t.Optional(t.String()),
        description: t.Optional(t.String()),
      }),
    },
  )

  // ─── Update event ──────────────────────────────────────────────
  .patch(
    "/events/:id",
    async ({ params, body, user, set }) => {
      const [dbUser] = await db
        .select({ familyId: schema.user.familyId })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));

      if (!dbUser?.familyId) {
        set.status = 404;
        return { error: "No family found." };
      }

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) updates.description = body.description;
      if (body.startTime !== undefined) updates.startTime = new Date(body.startTime);
      if (body.endTime !== undefined) updates.endTime = new Date(body.endTime);
      if (body.location !== undefined) updates.location = body.location;
      if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;
      if (body.completedAt !== undefined) updates.completedAt = body.completedAt ? new Date(body.completedAt) : null;

      const [event] = await db
        .update(schema.calendarEvents)
        .set(updates)
        .where(
          and(
            eq(schema.calendarEvents.id, params.id),
            eq(schema.calendarEvents.familyId, dbUser.familyId),
          ),
        )
        .returning();

      if (!event) {
        set.status = 404;
        return { error: "Event not found." };
      }

      return { event };
    },
    {
      body: t.Object({
        title: t.Optional(t.String()),
        description: t.Optional(t.String()),
        startTime: t.Optional(t.String()),
        endTime: t.Optional(t.String()),
        location: t.Optional(t.String()),
        assignedTo: t.Optional(t.Array(t.String())),
        completedAt: t.Optional(t.Nullable(t.String())),
      }),
    },
  )

  // ─── Delete event ──────────────────────────────────────────────
  .delete("/events/:id", async ({ params, user, set }) => {
    const [dbUser] = await db
      .select({ familyId: schema.user.familyId })
      .from(schema.user)
      .where(eq(schema.user.id, user.id));

    if (!dbUser?.familyId) {
      set.status = 404;
      return { error: "No family found." };
    }

    await db
      .delete(schema.calendarEvents)
      .where(
        and(
          eq(schema.calendarEvents.id, params.id),
          eq(schema.calendarEvents.familyId, dbUser.familyId),
        ),
      );

    return { deleted: true };
  });
