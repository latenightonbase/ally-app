import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSession } from "../../lib/auth";
import { acceptFamilyInvite, getFamily } from "../../lib/api";
import { useFamilyStore } from "../../store/useFamilyStore";
import { useTheme } from "../../context/ThemeContext";

const PENDING_INVITE_KEY = "anzi-pending-invite-token";

export async function storePendingInvite(token: string) {
  await AsyncStorage.setItem(PENDING_INVITE_KEY, token);
}

export async function consumePendingInvite(): Promise<string | null> {
  const token = await AsyncStorage.getItem(PENDING_INVITE_KEY);
  if (token) await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  return token;
}

export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { data: session, isPending: authPending } = useSession();
  const { theme } = useTheme();
  const setFamily = useFamilyStore((s) => s.setFamily);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (authPending || !token) return;

    if (!session?.user) {
      storePendingInvite(token).then(() => {
        router.replace("/(auth)/sign-in");
      });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await acceptFamilyInvite(token);
        if (cancelled) return;
        setStatus("success");
        const familyData = await getFamily().catch(() => null);
        if (familyData?.family) {
          setFamily(familyData.family, familyData.members);
        }
        setTimeout(() => router.replace("/(tabs)/family"), 1500);
      } catch (err: unknown) {
        if (cancelled) return;
        setStatus("error");
        const message =
          err instanceof Error ? err.message : "Could not accept invite.";
        setErrorMsg(message);
        setTimeout(() => router.replace("/(tabs)"), 3000);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, session?.user, authPending]);

  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: theme.colors["--color-background"] }}
    >
      <View className="flex-1 items-center justify-center px-6">
        {status === "loading" && (
          <>
            <ActivityIndicator
              size="large"
              color={theme.colors["--color-primary"]}
            />
            <Text
              className="text-secondary mt-4 text-base"
              style={{ color: theme.colors["--color-text-secondary"] }}
            >
              Joining family...
            </Text>
          </>
        )}
        {status === "success" && (
          <Text
            className="text-xl font-semibold"
            style={{ color: theme.colors["--color-primary"] }}
          >
            Welcome to the family!
          </Text>
        )}
        {status === "error" && (
          <Text
            className="text-base text-center"
            style={{ color: theme.colors["--color-error"] }}
          >
            {errorMsg}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}
