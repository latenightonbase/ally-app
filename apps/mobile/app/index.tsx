import { Redirect } from "expo-router";
import { useAppStore } from "../store/useAppStore";

export default function Index() {
  const isOnboarded = useAppStore((s) => s.isOnboarded);

  if (isOnboarded) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(onboarding)" />;
}
