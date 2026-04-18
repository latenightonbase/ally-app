import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import {
  buildAndroidAssetLinks,
  buildAppleAppSiteAssociation,
  buildInviteDeepLink,
  buildInviteJoinHtml,
  getAndroidPlayStoreUrl,
  getIosAppStoreUrl,
  type InvitePageState,
} from "../lib/inviteWeb";

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function jsonResponse(data: object, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

async function resolveInvitePageState(token: string): Promise<InvitePageState> {
  const [row] = await db
    .select({
      status: schema.familyInvites.status,
      expiresAt: schema.familyInvites.expiresAt,
    })
    .from(schema.familyInvites)
    .where(eq(schema.familyInvites.token, token))
    .limit(1);

  if (!row) return "invalid";
  if (row.status !== "pending") return "invalid";
  if (new Date() > row.expiresAt) return "expired";
  return "valid";
}

export const inviteWebRoutes = new Elysia()
  .get("/invite/:token", async ({ params }) => {
    const token = params.token;
    const state = await resolveInvitePageState(token);
    const deepLink = buildInviteDeepLink(token);
    const html = buildInviteJoinHtml({
      token,
      state,
      deepLink,
      iosStoreUrl: getIosAppStoreUrl(),
      androidStoreUrl: getAndroidPlayStoreUrl(),
    });
    return htmlResponse(html, 200);
  })
  .get("/.well-known/apple-app-site-association", () => {
    const body = buildAppleAppSiteAssociation();
    if (!body) {
      return new Response(null, { status: 404 });
    }
    return jsonResponse(body);
  })
  .get("/.well-known/assetlinks.json", () => {
    const body = buildAndroidAssetLinks();
    if (!body) {
      return new Response(null, { status: 404 });
    }
    return jsonResponse(body);
  });
