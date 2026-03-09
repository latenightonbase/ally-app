import { Elysia, t } from "elysia";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

export const webhookRoutes = new Elysia({ prefix: "/api/v1/webhooks" }).post(
  "/subscription",
  async ({ body, headers, set }) => {
    const secret = headers["x-webhook-secret"];
    if (secret !== process.env.WEBHOOK_SECRET) {
      set.status = 401;
      throw new Error("Invalid webhook secret");
    }

    await db
      .update(schema.user)
      .set({ tier: body.tier })
      .where(eq(schema.user.id, body.userId));

    return { acknowledged: true };
  },
  {
    body: t.Object({
      userId: t.String(),
      event: t.String(),
      tier: t.String(),
      effectiveAt: t.String(),
    }),
  },
);
