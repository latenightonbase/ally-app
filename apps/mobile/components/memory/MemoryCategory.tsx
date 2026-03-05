import React from "react";
import { View, Text } from "react-native";
import { MotiView } from "moti";

interface MemoryCategoryProps {
  label: string;
  emoji: string;
  count: number;
}

export function MemoryCategory({ label, emoji, count }: MemoryCategoryProps) {
  return (
    <View className="flex-row items-center mb-3 mt-5">
      <Text className="text-lg mr-2">{emoji}</Text>
      <Text className="text-foreground text-lg font-sans-semibold flex-1">
        {label}
      </Text>
      <Text className="text-muted text-sm font-sans">
        {count} {count === 1 ? "memory" : "memories"}
      </Text>
    </View>
  );
}
