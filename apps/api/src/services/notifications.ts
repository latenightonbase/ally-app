export interface PushPayload {
  type: string;
  [key: string]: unknown;
}

export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data: PushPayload = { type: "general" },
): Promise<boolean> {
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ to: token, title, body, sound: "default", data }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "unknown");
      console.error(
        `[notifications] Expo push failed (${response.status}): ${text}`,
      );
      return false;
    }

    const result = (await response.json().catch(() => null)) as Record<string, any> | null;

    // Expo returns { data: { status: "error", message: "..." } } for bad tokens
    if (result?.data?.status === "error") {
      console.error(
        `[notifications] Expo push rejected: ${result.data.message} (token: ${token.slice(0, 20)}...)`,
      );
      return false;
    }

    console.log(`[notifications] Push sent successfully to ${token.slice(0, 20)}...`);
    return true;
  } catch (err) {
    console.error(
      `[notifications] Push send error:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
