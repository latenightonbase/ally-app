import { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { Redirect } from "expo-router";
import { MotiView } from "moti";
import { useAppStore } from "../store/useAppStore";
import { useSession } from "../lib/auth";
import { getMemoryProfile, getUserProfile } from "../lib/api";

export default function Index() {
  const { data: session, isPending } = useSession();
  const isOnboarded = useAppStore((s) => s.isOnboarded);
  const userName = useAppStore((s) => s.user.name);
  const setTier = useAppStore((s) => s.setTier);
  const completeOnboardingStore = useAppStore((s) => s.completeOnboarding);
  const resetOnboarding = useAppStore((s) => s.resetOnboarding);

  const initialized = useRef(false);
  const previousUserId = useRef<string | null>(null);

  // Tracks whether the server confirmed this is a returning user logging in
  // on a new device (or after a re-install). We show a "Welcome back" splash.
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  // Reset guards when the user changes (logout or switch account)
  useEffect(() => {
    const currentUserId = session?.user?.id ?? null;

    if (!currentUserId) {
      initialized.current = false;
      previousUserId.current = null;
      setShowWelcomeBack(false);
      setSyncDone(false);
      return;
    }

    if (previousUserId.current && previousUserId.current !== currentUserId) {
      initialized.current = false;
      setShowWelcomeBack(false);
      setSyncDone(false);
    }

    previousUserId.current = currentUserId;
  }, [session]);

  useEffect(() => {
    if (!session || initialized.current) return;
    initialized.current = true;

    (async () => {
      try {
        // Verify onboarding state server-side (handles new-device login)
        const { profile } = await getMemoryProfile();
        if (profile && !isOnboarded) {
          // Returning user on a fresh install / new device — skip onboarding
          const resolvedName = profile.personalInfo?.preferredName ?? "";
          completeOnboardingStore(
            {
              name: resolvedName,
              allyName: "Anzi",
              dailyPingTime: "09:00",
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            // No welcome message — the chat will show a re-entry greeting instead
            "__SKIP_WELCOME__",
          );
          setShowWelcomeBack(true);
        } else if (!profile && isOnboarded) {
          // Server says this user has no profile — local state is stale
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

      setSyncDone(true);
    })();
  }, [session]);

  // "Welcome back" interstitial — auto-dismiss after 1.8s
  useEffect(() => {
    if (!showWelcomeBack) return;
    const timer = setTimeout(() => {
      setShowWelcomeBack(false);
    }, 1800);
    return () => clearTimeout(timer);
  }, [showWelcomeBack]);

  if (isPending || (session && !syncDone)) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  // Show the "Welcome back" splash for returning users
  if (showWelcomeBack) {
    const displayName = userName || "friend";
    return (
      <View className="flex-1 bg-background items-center justify-center px-8">
        <MotiView
          from={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "timing", duration: 600 }}
          className="items-center"
        >
          <View className="w-20 h-20 rounded-full bg-primary items-center justify-center mb-6">
            <Text className="text-white text-3xl font-sans-bold">A</Text>
          </View>
          <Text className="text-foreground text-3xl font-sans-bold text-center mb-2">
            Welcome back, {displayName}
          </Text>
          <Text className="text-muted text-base font-sans text-center">
            I've been keeping track of everything for you.
          </Text>
        </MotiView>
      </View>
    );
  }

  if (!isOnboarded) {
    return <Redirect href="/(onboarding)" />;
  }

  return <Redirect href="/(tabs)" />;
}
