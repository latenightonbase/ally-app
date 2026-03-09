import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useAppStore } from "../store/useAppStore";
import { useSession } from "../lib/auth";

export default function Index() {
  const { data: session, isPending } = useSession();
  const isOnboarded = useAppStore((s) => s.isOnboarded);

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
