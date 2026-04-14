import { useEffect, useRef, useState } from "react";
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
  const resetOnboarding = useAppStore((s) => s.resetOnboarding);

  const initialized = useRef(false);
  const previousUserId = useRef<string | null>(null);
  // Prevent premature redirect while we verify onboarding state server-side
  const [resolving, setResolving] = useState(false);

  // Reset guards when the user changes (logout or switch account)
  useEffect(() => {
    const currentUserId = session?.user?.id ?? null;

    if (!currentUserId) {
      initialized.current = false;
      previousUserId.current = null;
      return;
    }

    if (previousUserId.current && previousUserId.current !== currentUserId) {
      // New user — reset so we re-verify
      initialized.current = false;
      resetOnboarding();
    }

    previousUserId.current = currentUserId;
  }, [session]);

  useEffect(() => {
    if (!session || initialized.current) return;
    initialized.current = true;
    setResolving(true);

    (async () => {
      try {
        // Verify onboarding state server-side (handles new-device login & account switches)
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
        } else if (!profile && isOnboarded) {
          resetOnboarding();
        }
      } catch {
        // Best-effort — keep local state if server is unreachable
      }

      try {
        const serverProfile = await getUserProfile();
        setTier(serverProfile.tier);
      } catch {
        // Best-effort
      }

      setResolving(false);
    })();
  }, [session]);

  if (isPending || resolving) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Fully onboarded with account → go to app
  if (session && isOnboarded) {
    return <Redirect href="/(tabs)" />;
  }

  // Has account but not onboarded yet (edge case / new device)
  if (session && !isOnboarded) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

  // No account — show welcome screen to start the guest flow
  return <Redirect href="/(onboarding)/welcome" />;
}
