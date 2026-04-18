function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}

export function getInviteWebBaseUrl(): string | undefined {
  const raw = process.env.INVITE_WEB_BASE_URL?.trim();
  if (!raw) return undefined;
  return trimTrailingSlashes(raw);
}

export function buildPublicInviteUrl(token: string): string | null {
  const base = getInviteWebBaseUrl();
  if (!base) return null;
  return `${base}/invite/${encodeURIComponent(token)}`;
}

export function buildInviteDeepLink(token: string): string {
  return `ally-app://invite/${token}`;
}

export function getIosAppStoreUrl(): string | undefined {
  const u = process.env.IOS_APP_STORE_URL?.trim();
  return u || undefined;
}

export function getAndroidPlayStoreUrl(): string | undefined {
  const u = process.env.ANDROID_PLAY_STORE_URL?.trim();
  return u || undefined;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type InvitePageState = "valid" | "expired" | "invalid";

export function buildInviteJoinHtml(input: {
  token: string;
  state: InvitePageState;
  deepLink: string;
  iosStoreUrl?: string;
  androidStoreUrl?: string;
}): string {
  const { token, state, deepLink, iosStoreUrl, androidStoreUrl } = input;
  const safeToken = escapeHtml(token);
  const safeDeep = escapeHtml(deepLink);

  const title =
    state === "valid"
      ? "Join family on Anzi"
      : state === "expired"
        ? "Invite expired"
        : "Invite not found";

  const intro =
    state === "valid"
      ? "<p>This link was shared with you to join a family in Anzi. Open the app to accept, or install Anzi from your app store.</p>"
      : state === "expired"
        ? "<p>This invite link has expired. Ask the family admin to send a new invite.</p>"
        : "<p>This invite link is not valid. Check with the person who sent it.</p>";

  const openCta =
    state === "valid"
      ? `<p><a class="btn primary" href="${safeDeep}">Open in Anzi</a></p>`
      : "";

  const storeLinks: string[] = [];
  if (iosStoreUrl) {
    const href = escapeHtml(iosStoreUrl);
    storeLinks.push(`<a class="btn" href="${href}">App Store</a>`);
  }
  if (androidStoreUrl) {
    const href = escapeHtml(androidStoreUrl);
    storeLinks.push(`<a class="btn" href="${href}">Google Play</a>`);
  }
  const storesBlock =
    storeLinks.length > 0
      ? `<div class="stores">${storeLinks.join(" ")}</div>`
      : "<p class=\"muted\">App store links are not configured for this server yet.</p>";

  const storeSection =
    state === "valid"
      ? storesBlock
      : `<p class="muted">Get Anzi to join a family:</p>${storesBlock}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem; background: #f8fafc; color: #0f172a; line-height: 1.5; }
    main { max-width: 28rem; margin: 2rem auto; background: #fff; padding: 1.5rem; border-radius: 12px; box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); }
    h1 { font-size: 1.25rem; margin: 0 0 1rem; }
    p { margin: 0 0 1rem; }
    .muted { color: #64748b; font-size: 0.875rem; }
    .btn { display: inline-block; padding: 0.65rem 1rem; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 0 0.5rem 0.5rem 0; }
    .btn.primary { background: #4f46e5; color: #fff; }
    .btn { background: #e2e8f0; color: #0f172a; }
    .stores { margin-top: 1rem; }
    code { font-size: 0.75rem; word-break: break-all; color: #475569; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    ${intro}
    ${openCta}
    ${storeSection}
    ${state === "valid" ? `<p class="muted">If the button does not open the app, copy this link:<br /><code>${safeDeep}</code></p>` : ""}
  </main>
</body>
</html>`;
}

export function buildAppleAppSiteAssociation(): object | null {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const bundleId = process.env.IOS_BUNDLE_ID?.trim();
  if (!teamId || !bundleId) return null;
  const appId = `${teamId}.${bundleId}`;
  return {
    applinks: {
      apps: [],
      details: [
        {
          appID: appId,
          paths: ["/invite/*"],
        },
      ],
    },
  };
}

export function buildAndroidAssetLinks(): object[] | null {
  const packageName = process.env.ANDROID_ASSETLINKS_PACKAGE?.trim();
  const fingerprintsRaw = process.env.ANDROID_ASSETLINKS_SHA256?.trim();
  if (!packageName || !fingerprintsRaw) return null;
  const sha256_cert_fingerprints = fingerprintsRaw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sha256_cert_fingerprints.length === 0) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints,
      },
    },
  ];
}
