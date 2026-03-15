import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "../../context/ThemeContext";

interface CompletenessNudgeProps {
  section: string;
  prompt: string;
}

const SECTION_PROMPTS: Record<string, string> = {
  interests: "Tell Ally about your hobbies and interests →",
  relationships: "Tell Ally about the people in your life →",
  work: "Tell Ally about your work and career →",
  health: "Tell Ally about your health and wellness →",
  emotionalPatterns: "Tell Ally how you've been feeling lately →",
};

export function CompletenessNudge({ section }: CompletenessNudgeProps) {
  const { theme } = useTheme();
  const nudgeText = SECTION_PROMPTS[section] ?? "Share more with Ally →";

  const handlePress = () => {
    router.push("/(tabs)");
  };

  return (
    <Pressable
      onPress={handlePress}
      className="border border-primary-soft rounded-2xl px-4 py-3 mb-3 flex-row items-center gap-3 active:opacity-70"
    >
      <View className="w-7 h-7 rounded-xl bg-primary-soft items-center justify-center">
        <Ionicons
          name="add"
          size={16}
          color={theme.colors["--color-primary"]}
        />
      </View>
      <Text className="text-primary text-sm font-sans-medium flex-1">
        {nudgeText}
      </Text>
    </Pressable>
  );
}
