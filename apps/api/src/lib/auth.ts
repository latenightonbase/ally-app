import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { bearer } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import { importPKCS8, SignJWT } from "jose";

async function generateAppleClientSecret() {
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const clientId = process.env.APPLE_CLIENT_ID;

  if (!privateKey || !teamId || !keyId || !clientId) return "";

  try {
    const key = await importPKCS8(privateKey.replace(/\\n/g, "\n"), "ES256");
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId })
      .setIssuer(teamId)
      .setSubject(clientId)
      .setAudience("https://appleid.apple.com")
      .setIssuedAt(now)
      .setExpirationTime(now + 180 * 24 * 60 * 60)
      .sign(key);
  } catch (e) {
    console.warn("[auth] Failed to generate Apple client secret:", e);
    return "";
  }
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
  basePath: "/api/auth",
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    apple: {
      clientId: process.env.APPLE_CLIENT_ID ?? "",
      clientSecret: await generateAppleClientSecret(),
      appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER ?? "",
    },
  },
  plugins: [expo(), bearer()],
  trustedOrigins: [
    "ally-app://",
    "https://appleid.apple.com",
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

