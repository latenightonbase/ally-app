import { Elysia } from "elysia";
import { auth } from "../lib/auth";
import type { Tier } from "@ally/shared";

export const authMiddleware = new Elysia({ name: "auth" }).derive(
  { as: "scoped" },
  async ({ headers, set }) => {
    const session = await auth.api.getSession({
      headers: new Headers(headers as Record<string, string>),
    });

    if (!session) {
      set.status = 401;
      throw new Error("Not authenticated");
    }

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        tier: ((session.user as any).tier ?? "free_trial") as Tier,
        trialEndsAt: null,
      },
    };
  },
);
