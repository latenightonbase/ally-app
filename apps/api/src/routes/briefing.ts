import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { db, schema } from "../db";
import { eq, desc } from "drizzle-orm";
import { ensureBriefingForUser } from "../ai/briefing";
import { emit } from "../services/events";

export const briefingRoutes = new Elysia({ prefix: "/api/v1" })
  .use(authMiddleware)
  .get(
    "/briefing",
    async ({ query, user }) => {
      const date = query.date ?? new Date().toISOString().split("T")[0];
      const isToday = date === new Date().toISOString().split("T")[0];

      emit("user:app_opened", { userId: user.id });

      let briefing = isToday
        ? await ensureBriefingForUser(user.id)
        : await db.query.briefings
            .findFirst({
              where: (b, { and, eq: deq }) =>
                and(deq(b.userId, user.id), deq(b.date, date)),
            })
            .then((b) =>
              b
                ? {
                    id: b.id,
                    date: b.date,
                    content: b.content,
                    delivered: b.delivered,
                    createdAt: b.createdAt.toISOString(),
                  }
                : null,
            );

      if (!briefing) return { briefing: null };

      if (!briefing.delivered) {
        await db
          .update(schema.briefings)
          .set({ delivered: true })
          .where(eq(schema.briefings.id, briefing.id));
        briefing = { ...briefing, delivered: true };
      }

      return { briefing };
    },
    {
      query: t.Object({
        date: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/briefing/history",
    async ({ query, user }) => {
      const limit = Math.min(Number(query.limit ?? 7), 30);
      const offset = Number(query.offset ?? 0);

      const briefings = await db.query.briefings.findMany({
        where: eq(schema.briefings.userId, user.id),
        orderBy: [desc(schema.briefings.date)],
        limit,
        offset,
      });

      return {
        briefings: briefings.map((b) => ({
          id: b.id,
          date: b.date,
          content: b.content,
          delivered: b.delivered,
          createdAt: b.createdAt.toISOString(),
        })),
        limit,
        offset,
      };
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  );
