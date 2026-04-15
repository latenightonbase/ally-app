import { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "../lib/auth";
import { useAppStore } from "../store/useAppStore";
import { getUserProfile } from "../lib/api";

export default function Index() {
  const { data: session, isPending } = useSession();
  const setTier = useAppStore((s) => s.setTier);
  const setUser = useAppStore((s) => s.setUser);
  const initialized = useRef(false);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!session || initialized.current) return;
    initialized.current = true;
    setResolving(true);

    (async () => {
      try {
        const serverProfile = await getUserProfile();
        setTier(serverProfile.tier);
        if (serverProfile.name) {
          setUser({ name: serverProfile.name });
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

  // Authenticated → go to app
  if (session) {
    return <Redirect href="/(tabs)" />;
  }

  // Not authenticated → sign in
  return <Redirect href="/(auth)/sign-in" />;
}
