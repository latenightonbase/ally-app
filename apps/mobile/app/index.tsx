import { useEffect, useRef } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useAppStore } from "../store/useAppStore";
import { useSession } from "../lib/auth";
import { getMemoryProfile, getUserProfile } from "../lib/api";

export default function Index() {
  const { data: session, isPending } = useSession();
  const isOnboarded = useAppStore((s) => s.isOnboarded);
  const setTier = useAppStore((s) => s.setTier);
  const completeOnboardingStore = useAppStore((s) => s.completeOnboarding);

  const initialized = useRef(false);

  useEffect(() => {
    if (!session || initialized.current) return;
    initialized.current = true;

    (async () => {
      try {
        // Verify onboarding state server-side (handles new-device login)
        const { profile } = await getMemoryProfile();
        if (profile && !isOnboarded) {
          completeOnboardingStore(
            {
              name: profile.personalInfo?.preferredName ?? "",
              allyName: "Anzi",
              dailyPingTime: "09:00",
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            undefined,
          );
        }
      } catch {
        // Best-effort — keep local state if server is unreachable
      }

      try {
        // Load server-side tier and profile preferences into store
        const serverProfile = await getUserProfile();
        setTier(serverProfile.tier);
      } catch {
        // Best-effort
      }
    })();
  }, [session]);

  if (isPending) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (!isOnboarded) {
    return <Redirect href="/(onboarding)" />;
  }

  return <Redirect href="/(tabs)" />;
}
