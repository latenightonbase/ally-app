import { useState, useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { registerPushToken, getConversationMessages } from "./api";
import { useSession } from "./auth";
import { useAppStore, type ChatMessage } from "../store/useAppStore";

// ---------------------------------------------------------------------------
// Foreground notification handler — show banner + sound even when app is open
// ---------------------------------------------------------------------------
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ---------------------------------------------------------------------------
// Register for push notifications (permission + token)
// ---------------------------------------------------------------------------
export async function registerForPushNotificationsAsync(): Promise<
  string | undefined
> {
  // Android requires an explicit notification channel (Android 8+)
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  // Warn on simulator but don't bail — Expo push tokens can still be obtained
  // for development purposes (actual delivery requires a real device).
  if (!Device.isDevice) {
    console.warn(
      "[notifications] Running on simulator — push delivery won't work, but token registration will proceed.",
    );
  }

  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("[notifications] Permission not granted.");
    return undefined;
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  if (!projectId) {
    console.error("[notifications] Project ID not found.");
    return undefined;
  }

  try {
    const pushTokenString = (
      await Notifications.getExpoPushTokenAsync({ projectId })
    ).data;
    console.log("[notifications] Expo push token:", pushTokenString);
    return pushTokenString;
  } catch (e) {
    console.error("[notifications] Failed to get push token:", e);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Hook: useNotifications
// Call once near the root of your app (e.g. in _layout.tsx).
// Waits for an active session before registering the push token with the
// backend so the API call has valid auth cookies.
// ---------------------------------------------------------------------------
export function useNotifications() {
  const { data: session } = useSession();
  const [expoPushToken, setExpoPushToken] = useState<string>("");
  const [notification, setNotification] = useState<
    Notifications.Notification | undefined
  >(undefined);
  const notificationListener = useRef<Notifications.EventSubscription>(null);
  const responseListener = useRef<Notifications.EventSubscription>(null);
  const tokenSentRef = useRef(false);

  /**
   * When a reminder notification arrives, refresh the chat messages so the
   * user sees the in-conversation reminder message immediately.
   */
  const refreshChatFromNotification = useCallback(
    async (data: Record<string, unknown>) => {
      if (data?.type !== "reminder" && data?.type !== "checkin" && data?.type !== "daily_ping") return;

      const convId =
        (data.conversationId as string) ??
        useAppStore.getState().activeConversationId;
      if (!convId) return;

      try {
        const { messages: serverMessages } = await getConversationMessages(
          convId,
          50,
        );
        const localMessages: ChatMessage[] = serverMessages.map((m) => ({
          id: m.id,
          text: m.content,
          isUser: m.role === "user",
          timestamp: new Date(m.createdAt),
        }));
        useAppStore.getState().setMessages(localMessages);
      } catch {
        // Best-effort — user will see the message next time they open the chat
      }
    },
    [],
  );

  // Register push token with backend once the user is authenticated
  useEffect(() => {
    if (!session?.user || tokenSentRef.current) return;

    registerForPushNotificationsAsync()
      .then(async (token) => {
        if (token) {
          setExpoPushToken(token);
          try {
            await registerPushToken(token);
            tokenSentRef.current = true;
            console.log("[notifications] Token saved to backend.");
          } catch (e) {
            // Will retry on next app launch / session change
            console.warn("[notifications] Failed to save token to backend:", e);
          }
        }
      })
      .catch((err) => {
        console.error("[notifications] Registration error:", err);
      });
  }, [session?.user]);

  // Notification listeners (independent of auth)
  useEffect(() => {
    // Listen for incoming notifications while app is foregrounded
    notificationListener.current =
      Notifications.addNotificationReceivedListener((n) => {
        setNotification(n);

        // Refresh chat messages if this is a reminder notification
        const data = n.request.content.data;
        if (data) refreshChatFromNotification(data);
      });

    // Listen for user tapping a notification
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        console.log("[notifications] User tapped notification:", data);

        // Refresh chat messages when the user taps a reminder notification
        if (data) refreshChatFromNotification(data);
      });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [refreshChatFromNotification]);

  return { expoPushToken, notification };
}
