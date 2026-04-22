import React from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../ui/Avatar";
import { useAppStore } from "../../store/useAppStore";
import { useSession } from "../../lib/auth";
import { useSettingsSheet } from "../../store/useSettingsSheet";
import { useTheme } from "../../context/ThemeContext";

export function ChatHeader() {
  const { theme } = useTheme();
  const allyName = useAppStore((s) => s.user.allyName) || "Anzi";
  const session = useSession();
  const storeName = useAppStore((s) => s.user.name);
  const presentSettings = useSettingsSheet((s) => s.present);

  const displayName =
    (session.data?.user as { name?: string; email?: string } | undefined)
      ?.name ??
    storeName ??
    (session.data?.user?.email as string | undefined) ??
    "A";

  const initial = (displayName || "A").trim().charAt(0).toUpperCase() || "A";

  return (
    <SafeAreaView
      edges={["top"]}
      style={{ backgroundColor: theme.colors["--color-background"] }}
    >
      <View
        className="flex-row items-center px-5 py-3"
        style={{
          borderBottomWidth: 1,
          borderBottomColor: theme.colors["--color-border"],
        }}
      >
        <Avatar
          name={allyName.charAt(0).toUpperCase()}
          size="md"
          color={theme.colors["--color-primary"]}
          online
        />
        <View className="ml-3 flex-1">
          <Text
            className="text-lg font-sans-bold"
            style={{ color: theme.colors["--color-foreground"] }}
          >
            {allyName}
          </Text>
          <Text
            className="text-xs font-sans"
            style={{ color: theme.colors["--color-muted"] }}
          >
            Your family's AI organiser
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open profile and settings"
          onPress={presentSettings}
          hitSlop={8}
          className="active:opacity-70"
        >
          <Avatar name={initial} size="md" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
