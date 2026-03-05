import { Elysia } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { requireTier } from "../middleware/tierCheck";
import { db, schema } from "../db";
import { eq, and, desc } from "drizzle-orm";
import type { WeeklyInsight } from "@ally/shared";

export const insightRoutes = new Elysia({ prefix: "/api/v1" })
  .use(authMiddleware)
  .use(
    requireTier({
      requiredTiers: ["premium"],
      featureName: "Weekly insights",
    }),
  )
  .get("/insights/weekly", async ({ user }) => {
    const latestRun = await db.query.jobRuns.findFirst({
      where: and(
        eq(schema.jobRuns.jobName, "weekly_insights"),
        eq(schema.jobRuns.userId, user.id),
        eq(schema.jobRuns.status, "completed"),
      ),
      orderBy: [desc(schema.jobRuns.completedAt)],
    });

    if (!latestRun?.metadata || !("insight" in latestRun.metadata)) {
      return {
        insight: null,
        message:
          "Weekly insights will be available after your first full week of use.",
      };
    }

    return {
      insight: latestRun.metadata.insight as WeeklyInsight,
    };
  });
