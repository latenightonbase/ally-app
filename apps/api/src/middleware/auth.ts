import { Elysia } from "elysia";
import { jwtVerify } from "jose";
import type { Tier } from "@ally/shared";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret",
);

export const authMiddleware = new Elysia({ name: "auth" }).derive(
  { as: "scoped" },
  async ({ headers, set }) => {
    const authorization = headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      set.status = 401;
      throw new Error("Missing or invalid authorization header");
    }

    const token = authorization.slice(7);

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      return {
        user: {
          id: payload.sub as string,
          email: payload.email as string,
          tier: payload.tier as Tier,
          trialEndsAt: (payload.trial_ends_at as string) ?? null,
        },
      };
    } catch (e) {
      set.status = 401;
      throw new Error(
        e instanceof Error && e.message.includes("expired")
          ? "Token has expired, please refresh"
          : "Invalid token",
      );
    }
  },
);
