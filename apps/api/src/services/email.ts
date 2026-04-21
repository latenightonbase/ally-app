const RESEND_API_URL = "https://api.resend.com/emails";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Anzi <onboarding@resend.dev>";

  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY not set — skipping email to ${to} ("${subject}")`,
    );
    return false;
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "unknown");
      console.error(`[email] Resend failed (${response.status}): ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Resend request errored:", err);
    return false;
  }
}

export interface FamilyInviteEmailParams {
  to: string;
  familyName: string;
  inviterName: string;
  inviteCode: string;
}

export async function sendFamilyInviteEmail(
  params: FamilyInviteEmailParams,
): Promise<boolean> {
  const { to, familyName, inviterName, inviteCode } = params;
  const subject = `${inviterName} invited you to join ${familyName} on Anzi`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #0f172a;">
      <h1 style="font-size: 24px; margin-bottom: 8px;">You've been invited to ${escapeHtml(familyName)}</h1>
      <p style="font-size: 16px; line-height: 1.5; color: #475569;">
        ${escapeHtml(inviterName)} wants you to join their family on Anzi — a shared space for calendars, tasks, and reminders.
      </p>
      <div style="margin: 32px 0; padding: 24px; background: #f1f5f9; border-radius: 12px; text-align: center;">
        <div style="font-size: 12px; letter-spacing: 2px; color: #64748b; text-transform: uppercase; margin-bottom: 8px;">Your invite code</div>
        <div style="font-size: 32px; letter-spacing: 6px; font-weight: 700; color: #0f172a;">${escapeHtml(inviteCode)}</div>
      </div>
      <p style="font-size: 14px; line-height: 1.5; color: #64748b;">
        Download Anzi, create an account, and enter this code on the "Join a family" screen to get started.
      </p>
    </div>
  `.trim();
  const text = `${inviterName} invited you to join ${familyName} on Anzi.\n\nYour invite code: ${inviteCode}\n\nDownload Anzi, create an account, and enter this code on the "Join a family" screen.`;

  return sendEmail({ to, subject, html, text });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
