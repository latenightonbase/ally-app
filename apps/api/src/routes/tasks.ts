import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { db, schema } from "../db";
import { and, eq, isNull, asc, desc } from "drizzle-orm";

export const taskRoutes = new Elysia({ prefix: "/api/v1/tasks" })
  .use(authMiddleware)

  // ─── Get tasks ─────────────────────────────────────────────────
  .get("/", async ({ query, user, set }) => {
    const [dbUser] = await db
      .select({ familyId: schema.user.familyId })
      .from(schema.user)
      .where(eq(schema.user.id, user.id));

    if (!dbUser?.familyId) {
      set.status = 404;
      return { error: "No family found." };
    }

    const status = query.status ?? "pending";

    const tasks = await db
      .select()
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.familyId, dbUser.familyId),
          status === "all" ? undefined : eq(schema.tasks.status, status as any),
        ),
      )
      .orderBy(asc(schema.tasks.dueDate));

    // Resolve member names
    const members = await db
      .select({ id: schema.familyMembers.id, name: schema.familyMembers.name })
      .from(schema.familyMembers)
      .where(eq(schema.familyMembers.familyId, dbUser.familyId));

    const memberMap = new Map(members.map((m) => [m.id, m.name]));

    return {
      tasks: tasks.map((t) => ({
        ...t,
        dueDate: t.dueDate?.toISOString(),
        completedAt: t.completedAt?.toISOString(),
        createdAt: t.createdAt?.toISOString(),
        updatedAt: t.updatedAt?.toISOString(),
        assignedToName: t.assignedTo ? memberMap.get(t.assignedTo) ?? null : null,
      })),
    };
  })

  // ─── Create task ───────────────────────────────────────────────
  .post(
    "/",
    async ({ body, user, set }) => {
      const [dbUser] = await db
        .select({ familyId: schema.user.familyId })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));

      if (!dbUser?.familyId) {
        set.status = 404;
        return { error: "No family found." };
      }

      const [task] = await db
        .insert(schema.tasks)
        .values({
          familyId: dbUser.familyId,
          createdBy: user.id,
          title: body.title,
          description: body.description ?? null,
          assignedTo: body.assignedTo ?? null,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          priority: body.priority ?? "medium",
          category: body.category ?? null,
          recurrence: (body.recurrence as any) ?? "none",
        })
        .returning();

      return { task };
    },
    {
      body: t.Object({
        title: t.String(),
        description: t.Optional(t.String()),
        assignedTo: t.Optional(t.String()),
        dueDate: t.Optional(t.String()),
        priority: t.Optional(t.String()),
        category: t.Optional(t.String()),
        recurrence: t.Optional(t.String()),
      }),
    },
  )

  // ─── Update task (status, assignment, etc.) ────────────────────
  .patch(
    "/:id",
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
      if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;
      if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;
      if (body.priority !== undefined) updates.priority = body.priority;
      if (body.status !== undefined) {
        updates.status = body.status;
        if (body.status === "completed") updates.completedAt = new Date();
      }

      const [task] = await db
        .update(schema.tasks)
        .set(updates)
        .where(
          and(
            eq(schema.tasks.id, params.id),
            eq(schema.tasks.familyId, dbUser.familyId),
          ),
        )
        .returning();

      if (!task) {
        set.status = 404;
        return { error: "Task not found." };
      }

      return { task };
    },
    {
      body: t.Object({
        title: t.Optional(t.String()),
        description: t.Optional(t.String()),
        assignedTo: t.Optional(t.Nullable(t.String())),
        dueDate: t.Optional(t.Nullable(t.String())),
        priority: t.Optional(t.String()),
        status: t.Optional(t.String()),
      }),
    },
  )

  // ─── Delete task ───────────────────────────────────────────────
  .delete("/:id", async ({ params, user, set }) => {
    const [dbUser] = await db
      .select({ familyId: schema.user.familyId })
      .from(schema.user)
      .where(eq(schema.user.id, user.id));

    if (!dbUser?.familyId) {
      set.status = 404;
      return { error: "No family found." };
    }

    await db
      .delete(schema.tasks)
      .where(
        and(
          eq(schema.tasks.id, params.id),
          eq(schema.tasks.familyId, dbUser.familyId),
        ),
      );

    return { deleted: true };
  });
