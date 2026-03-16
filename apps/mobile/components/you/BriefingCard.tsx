import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MotiView, AnimatePresence } from "moti";
import { useTheme } from "../../context/ThemeContext";

interface BriefingCardProps {
  content: string;
  date: string;
}

export function BriefingCard({ content, date }: BriefingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { theme } = useTheme();

  const preview = content.slice(0, 120) + (content.length > 120 ? "…" : "");

  return (
    <View className="bg-primary-soft rounded-3xl p-6 mb-8">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2.5">
          <View className="w-8 h-8 rounded-full bg-background items-center justify-center">
            <Ionicons
              name="sunny-outline"
              size={17}
              color={theme.colors["--color-primary"]}
            />
          </View>
          <Text className="text-primary text-xs font-sans-semibold uppercase tracking-wider">
            Today's Briefing
          </Text>
        </View>
        <Text className="text-muted text-xs font-sans">{date}</Text>
      </View>

      <Text className="text-foreground text-sm font-sans leading-relaxed pl-0.5">
        {expanded ? content : preview}
      </Text>

      {content.length > 120 && (
        <Pressable
          onPress={() => setExpanded((e) => !e)}
          className="mt-3 flex-row items-center gap-1 active:opacity-70"
        >
          <Text className="text-primary text-xs font-sans-semibold">
            {expanded ? "Show less" : "Read more"}
          </Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={12}
            color={theme.colors["--color-primary"]}
          />
        </Pressable>
      )}
    </View>
  );
}
