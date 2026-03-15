export interface PushPayload {
  type: string;
  [key: string]: unknown;
}

export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data: PushPayload = { type: "general" },
): Promise<void> {
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ to: token, title, body, sound: "default", data }),
  });
}
