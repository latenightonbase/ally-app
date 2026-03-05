import React from "react";
import { View, Text } from "react-native";
import { MotiView } from "moti";
import { Avatar } from "../ui/Avatar";
import { useAppStore } from "../../store/useAppStore";

interface AllyMessageProps {
  message: string;
}

export function AllyMessage({ message }: AllyMessageProps) {
  const allyName = useAppStore((s) => s.user.allyName) || "Ally";

  return (
    <MotiView
      from={{ opacity: 0, translateY: 15 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "spring", damping: 18, delay: 200 }}
      className="mb-6"
    >
      <View className="bg-primary-soft rounded-3xl p-5">
        <View className="flex-row items-center mb-3">
          <Avatar name={allyName.charAt(0).toUpperCase()} size="sm" />
          <Text className="text-primary text-sm font-sans-semibold ml-2">
            {allyName}
          </Text>
        </View>
        <Text className="text-foreground text-base font-sans leading-6 italic">
          "{message}"
        </Text>
      </View>
    </MotiView>
  );
}
