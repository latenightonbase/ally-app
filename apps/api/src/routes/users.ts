import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

export const userRoutes = new Elysia({ prefix: "/api/v1" })
  .use(authMiddleware)
  .post(
    "/users/push-token",
    async ({ body, user, set }) => {
      await db
        .update(schema.user)
        .set({ expoPushToken: body.token })
        .where(eq(schema.user.id, user.id));

      set.status = 200;
      return { saved: true };
    },
    {
      body: t.Object({
        token: t.String(),
      }),
    },
  );
