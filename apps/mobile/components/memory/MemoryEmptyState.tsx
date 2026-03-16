import React from "react";
import { View, Text } from "react-native";
import { MotiView } from "moti";
import { useAppStore } from "../../store/useAppStore";

interface MemoryEmptyStateProps {
  category: string;
}

export function MemoryEmptyState({ category }: MemoryEmptyStateProps) {
  const allyName = useAppStore((s) => s.user.allyName) || "Anzi";

  return (
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ type: "timing", duration: 400 }}
    >
      <View className="bg-surface/50 rounded-2xl p-6 items-center mb-2">
        <Text className="text-muted text-sm font-sans text-center">
          No {category.toLowerCase()} memories yet. {allyName} will remember things as you chat!
        </Text>
      </View>
    </MotiView>
  );
}
