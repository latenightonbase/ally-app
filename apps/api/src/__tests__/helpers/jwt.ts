import { SignJWT } from "jose";
import type { Tier } from "@ally/shared";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "test-jwt-secret-for-testing-only",
);

interface TokenPayload {
  sub: string;
  email: string;
  tier: Tier;
  trialEndsAt?: string;
}

export async function signTestToken(
  payload: Partial<TokenPayload> & { sub: string } = { sub: "test-user-id" },
  options?: { expiresIn?: string },
): Promise<string> {
  const jwt = new SignJWT({
    email: payload.email ?? "test@example.com",
    tier: payload.tier ?? "basic",
    trial_ends_at: payload.trialEndsAt ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt();

  if (options?.expiresIn) {
    jwt.setExpirationTime(options.expiresIn);
  } else {
    jwt.setExpirationTime("1h");
  }

  return jwt.sign(JWT_SECRET);
}

export async function signExpiredToken(sub = "test-user-id"): Promise<string> {
  return new SignJWT({ email: "test@example.com", tier: "basic" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(JWT_SECRET);
}

export const TEST_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "test@example.com",
  name: "Test User",
  tier: "basic" as Tier,
};

export const TEST_FREE_USER = {
  id: "00000000-0000-0000-0000-000000000002",
  email: "free@example.com",
  name: "Free User",
  tier: "free_trial" as Tier,
};

export const TEST_PREMIUM_USER = {
  id: "00000000-0000-0000-0000-000000000003",
  email: "premium@example.com",
  name: "Premium User",
  tier: "premium" as Tier,
};
