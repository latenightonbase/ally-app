import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "../../context/ThemeContext";

interface CompletenessNudgeProps {
  section: string;
  prompt: string;
}

const SECTION_PROMPTS: Record<string, { text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  interests: { text: "Share your hobbies and interests", icon: "heart-outline" },
  relationships: { text: "Tell us about the people in your life", icon: "people-outline" },
  work: { text: "Share what you're working on", icon: "briefcase-outline" },
  health: { text: "How are you taking care of yourself?", icon: "fitness-outline" },
  emotionalPatterns: { text: "How have you been feeling lately?", icon: "happy-outline" },
};

const DEFAULT_PROMPT = { text: "Share a bit more", icon: "chatbubble-outline" as keyof typeof Ionicons.glyphMap };

export function CompletenessNudge({ section }: CompletenessNudgeProps) {
  const { theme } = useTheme();
  const nudge = SECTION_PROMPTS[section] ?? DEFAULT_PROMPT;

  const handlePress = () => {
    router.push("/(tabs)");
  };

  return (
    <Pressable
      onPress={handlePress}
      className="bg-primary-soft/50 rounded-2xl px-4 py-4 mb-3 flex-row items-center gap-3.5 active:opacity-70"
    >
      <View className="w-9 h-9 rounded-2xl bg-background items-center justify-center">
        <Ionicons
          name={nudge.icon}
          size={17}
          color={theme.colors["--color-primary"]}
        />
      </View>
      <View className="flex-1">
        <Text className="text-primary text-sm font-sans-medium">
          {nudge.text}
        </Text>
        <Text className="text-primary/60 text-xs font-sans mt-0.5">
          Tap to chat →
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={theme.colors["--color-primary"]}
      />
    </Pressable>
  );
}
