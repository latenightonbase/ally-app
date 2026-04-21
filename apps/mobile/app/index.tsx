import { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "../lib/auth";
import { useAppStore } from "../store/useAppStore";
import { getUserProfile, getFamily } from "../lib/api";
import { consumePendingInvite } from "./invite/[token]";

type PostAuthDestination = "onboarding" | "family-setup" | "tabs";

export default function Index() {
  const { data: session, isPending } = useSession();
  const setTier = useAppStore((s) => s.setTier);
  const setUser = useAppStore((s) => s.setUser);
  const lastUserId = useRef<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [destination, setDestination] = useState<PostAuthDestination>("tabs");
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);

  useEffect(() => {
    const userId = session?.user?.id ?? null;

    if (!userId) {
      lastUserId.current = null;
      return;
    }

    if (lastUserId.current === userId) return;
    lastUserId.current = userId;

    setResolving(true);
    setDestination("tabs");

    (async () => {
      try {
        const inviteToken = await consumePendingInvite();
        if (inviteToken) {
          setPendingInviteToken(inviteToken);
          setResolving(false);
          return;
        }

        const serverProfile = await getUserProfile();
        setTier(serverProfile.tier);
        if (serverProfile.name) {
          setUser({ name: serverProfile.name });
        }

        const familyData = await getFamily().catch(() => null);
        if (!familyData?.family) {
          // Completed onboarding (has allyName) but hasn't picked a family yet.
          // Otherwise start the full onboarding from the top.
          setDestination(
            serverProfile.allyName ? "family-setup" : "onboarding",
          );
        }
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

  if (session) {
    if (pendingInviteToken) {
      return <Redirect href={`/invite/${pendingInviteToken}` as any} />;
    }
    if (destination === "onboarding") {
      return <Redirect href="/(onboarding)" />;
    }
    if (destination === "family-setup") {
      return <Redirect href="/(onboarding)/family-setup" />;
    }
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}
