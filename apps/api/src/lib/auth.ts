import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { bearer } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
  basePath: "/api/auth",
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [expo(), bearer()],
  trustedOrigins: [
    "ally-app://",
    ...(process.env.NODE_ENV === "development"
      ? [
          "exp://",
          "exp://**",
          "exp://192.168.*.*:*/**",
          "http://localhost:8081",
          "http://localhost:3000",
        ]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  user: {
    additionalFields: {
      tier: {
        type: "string",
        required: false,
        defaultValue: "free_trial",
        input: false,
      },
    },
  },
});
