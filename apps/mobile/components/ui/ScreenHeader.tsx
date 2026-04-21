import React from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { useSession } from "../../lib/auth";
import { useAppStore } from "../../store/useAppStore";
import { Avatar } from "./Avatar";

interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, rightSlot }: ScreenHeaderProps) {
  const session = useSession();
  const storeName = useAppStore((s) => s.user.name);

  const displayName =
    (session.data?.user as { name?: string; email?: string } | undefined)?.name ??
    storeName ??
    (session.data?.user?.email as string | undefined) ??
    "A";

  const initial = (displayName || "A").trim().charAt(0).toUpperCase() || "A";

  return (
    <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
      <View className="flex-1 pr-3">
        {title ? (
          <Text
            className="text-foreground text-2xl font-sans-bold"
            numberOfLines={1}
          >
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text className="text-muted text-xs font-sans mt-0.5" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View className="flex-row items-center">
        {rightSlot}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open profile and settings"
          onPress={() => router.push("/settings")}
          hitSlop={8}
          className="active:opacity-70"
        >
          <Avatar name={initial} size="md" />
        </Pressable>
      </View>
    </View>
  );
}
