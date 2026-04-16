import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import { sendPushNotification } from "./notifications";

interface NotifyMemberInput {
  memberId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface NotifyResult {
  memberId: string;
  memberName: string;
  delivered: boolean;
  method: "direct_push" | "parent_relay" | "no_token";
}

/**
 * Resolve a family member's push token. If they have a linked user account,
 * use that user's token. Otherwise, use the member's own expoPushToken field
 * (for shared/kid devices).
 */
async function resolvePushToken(
  memberId: string,
): Promise<{ token: string | null; memberName: string; linkedUserId: string | null }> {
  const member = await db.query.familyMembers.findFirst({
    where: eq(schema.familyMembers.id, memberId),
    columns: {
      name: true,
      userId: true,
      expoPushToken: true,
    },
  });

  if (!member) {
    return { token: null, memberName: "Unknown", linkedUserId: null };
  }

  // If the member has a linked user account, use that user's push token
  if (member.userId) {
    const userRow = await db.query.user.findFirst({
      where: eq(schema.user.id, member.userId),
      columns: { expoPushToken: true },
    });
    if (userRow?.expoPushToken) {
      return {
        token: userRow.expoPushToken,
        memberName: member.name,
        linkedUserId: member.userId,
      };
    }
  }

  // Fall back to the member's own push token (shared device / kid device)
  return {
    token: member.expoPushToken,
    memberName: member.name,
    linkedUserId: member.userId,
  };
}

/**
 * Send a push notification to a specific family member.
 * Resolves the member's push token (linked user or direct) and sends.
 */
export async function notifyFamilyMember(
  input: NotifyMemberInput,
): Promise<NotifyResult> {
  const { token, memberName } = await resolvePushToken(input.memberId);

  if (!token) {
    console.warn(
      `[notification-router] No push token for member ${input.memberId} (${memberName})`,
    );
    return {
      memberId: input.memberId,
      memberName,
      delivered: false,
      method: "no_token",
    };
  }

  const success = await sendPushNotification(
    token,
    input.title,
    input.body,
    { type: "family_notification", ...input.data },
  );

  return {
    memberId: input.memberId,
    memberName,
    delivered: success,
    method: "direct_push",
  };
}

/**
 * Notify multiple family members about an event/task/etc.
 * Best-effort — failures on individual members don't block others.
 */
export async function notifyFamilyMembers(
  memberIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<NotifyResult[]> {
  const results = await Promise.all(
    memberIds.map((memberId) =>
      notifyFamilyMember({ memberId, title, body, data }).catch(
        (): NotifyResult => ({
          memberId,
          memberName: "Unknown",
          delivered: false,
          method: "no_token",
        }),
      ),
    ),
  );

  const delivered = results.filter((r) => r.delivered);
  console.log(
    `[notification-router] Sent to ${delivered.length}/${memberIds.length} members`,
  );

  return results;
}

/**
 * Send a confirmation push back to the reminder creator.
 */
export async function notifyReminderCreator(
  userId: string,
  memberName: string,
  reminderTitle: string,
): Promise<boolean> {
  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { expoPushToken: true, allyName: true },
  });

  if (!userRow?.expoPushToken) return false;

  return sendPushNotification(
    userRow.expoPushToken,
    userRow.allyName ?? "Anzi",
    `Reminded ${memberName} about ${reminderTitle} ✅`,
    { type: "reminder_confirmation" },
  );
}
