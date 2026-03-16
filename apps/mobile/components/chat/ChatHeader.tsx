import React from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../ui/Avatar";
import { useAppStore } from "../../store/useAppStore";

export function ChatHeader() {
  const allyName = useAppStore((s) => s.user.allyName) || "Anzi";

  return (
    <SafeAreaView edges={["top"]} className="bg-background">
      <View className="flex-row items-center px-5 py-3 border-b border-surface">
        <Avatar name={allyName.charAt(0).toUpperCase()} size="sm" />
        <View className="ml-3">
          <Text className="text-foreground text-lg font-sans-semibold">
            {allyName}
          </Text>
          <View className="flex-row items-center">
            <View className="w-2 h-2 rounded-full bg-primary mr-1.5" />
            <Text className="text-muted text-xs font-sans">Online</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
