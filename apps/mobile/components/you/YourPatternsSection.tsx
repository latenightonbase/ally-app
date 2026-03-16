import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SectionHeader } from "./SectionHeader";
import { CompletenessNudge } from "./CompletenessNudge";
import { useTheme } from "../../context/ThemeContext";

interface MoodEntry {
  period: string;
  trend: string;
  notes: string;
}

interface EmotionalPatterns {
  primaryStressors: string[];
  copingMechanisms: string[];
  moodTrends: MoodEntry[];
  recurringThemes: string[];
  sensitivities: string[];
}

interface YourPatternsSectionProps {
  emotionalPatterns: EmotionalPatterns;
  completeness: "clear" | "emerging" | "fuzzy";
}

const TREND_COLORS: Record<string, string> = {
  improving: "bg-secondary/20 text-secondary",
  stable: "bg-primary-soft text-primary",
  declining: "bg-danger/10 text-danger",
  mixed: "bg-muted/20 text-muted",
};

export function YourPatternsSection({
  emotionalPatterns,
  completeness,
}: YourPatternsSectionProps) {
  const stressors = Array.isArray(emotionalPatterns?.primaryStressors) ? emotionalPatterns.primaryStressors : [];
  const coping = Array.isArray(emotionalPatterns?.copingMechanisms) ? emotionalPatterns.copingMechanisms : [];
  const moodTrends = Array.isArray(emotionalPatterns?.moodTrends) ? emotionalPatterns.moodTrends : [];

  const hasContent = stressors.length > 0 || coping.length > 0 || moodTrends.length > 0;

  if (!hasContent && completeness !== "fuzzy") return null;

  const { theme } = useTheme();
  const latestMood = moodTrends[moodTrends.length - 1];

  return (
    <View className="mb-6">
      <SectionHeader title="Your Patterns" icon="pulse-outline" />

      <View className="bg-surface rounded-2xl px-4 py-5 mb-3">
        {latestMood && (
          <View className="flex-row items-center gap-2.5 mb-4">
            <View className="w-7 h-7 rounded-xl bg-primary-soft items-center justify-center">
              <Ionicons
                name="trending-up-outline"
                size={14}
                color={theme.colors["--color-primary"]}
              />
            </View>
            <Text className="text-muted text-xs font-sans-medium uppercase tracking-wider">
              Mood trend
            </Text>
            <View
              className={`px-2.5 py-0.5 rounded-full ${TREND_COLORS[latestMood.trend] ?? "bg-primary-soft text-primary"}`}
            >
              <Text className="text-xs font-sans-medium capitalize">
                {latestMood.trend}
              </Text>
            </View>
          </View>
        )}

        {stressors.length > 0 && (
          <View className="mb-4">
            <View className="flex-row items-center gap-2 mb-2.5">
              <Ionicons
                name="cloud-outline"
                size={14}
                color={theme.colors["--color-danger"]}
              />
              <Text className="text-muted text-xs font-sans-medium uppercase tracking-wider">
                What weighs on you
              </Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {stressors.map((s, i) => (
                <View
                  key={i}
                  className="bg-danger/10 px-3 py-1.5 rounded-full"
                >
                  <Text className="text-danger text-xs font-sans">{s}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {coping.length > 0 && (
          <View>
            <View className="flex-row items-center gap-2 mb-2.5">
              <Ionicons
                name="leaf-outline"
                size={14}
                color={theme.colors["--color-secondary"]}
              />
              <Text className="text-muted text-xs font-sans-medium uppercase tracking-wider">
                What grounds you
              </Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {coping.map((c, i) => (
                <View
                  key={i}
                  className="bg-secondary/20 px-3 py-1.5 rounded-full"
                >
                  <Text className="text-secondary text-xs font-sans">{c}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {completeness === "fuzzy" && (
        <CompletenessNudge section="emotionalPatterns" prompt="" />
      )}
    </View>
  );
}
