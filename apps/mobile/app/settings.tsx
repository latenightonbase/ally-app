import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useSettingsSheet } from "../store/useSettingsSheet";
import { useTheme } from "../context/ThemeContext";

export default function SettingsScreen() {
  const { theme } = useTheme();
  const presentSettings = useSettingsSheet((s) => s.present);

  useEffect(() => {
    presentSettings();
    const nav = router as unknown as { canGoBack?: () => boolean };
    if (typeof nav.canGoBack === "function" && nav.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  }, [presentSettings]);

  return (
    <View
      style={{ flex: 1, backgroundColor: theme.colors["--color-background"] }}
    />
  );
}
