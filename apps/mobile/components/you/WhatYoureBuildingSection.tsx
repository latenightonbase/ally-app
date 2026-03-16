import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SectionHeader } from "./SectionHeader";
import { CompletenessNudge } from "./CompletenessNudge";
import { useTheme } from "../../context/ThemeContext";

interface Goal {
  description: string;
  category: string;
  status: string;
  progressNotes: string | null;
}

interface WhatYoureBuildingSectionProps {
  goals: Goal[];
  completeness: "clear" | "emerging" | "fuzzy";
}

const CATEGORY_COLORS: Record<string, string> = {
  work: "bg-primary-soft text-primary",
  health: "bg-secondary/20 text-secondary",
  personal: "bg-accent/20 text-accent",
  financial: "bg-muted/20 text-muted",
};

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  work: "briefcase-outline",
  health: "fitness-outline",
  personal: "leaf-outline",
  financial: "wallet-outline",
  creative: "color-palette-outline",
  learning: "book-outline",
};

export function WhatYoureBuildingSection({
  goals,
  completeness,
}: WhatYoureBuildingSectionProps) {
  const safeGoals = Array.isArray(goals) ? goals : [];
  const { theme } = useTheme();
  if (safeGoals.length === 0 && completeness !== "fuzzy") return null;

  const colorClass =
    (cat: string) =>
      CATEGORY_COLORS[cat.toLowerCase()] ?? "bg-primary-soft text-primary";

  const getIcon = (cat: string) =>
    CATEGORY_ICONS[cat.toLowerCase()] ?? "rocket-outline";

  return (
    <View className="mb-6">
      <SectionHeader title="What You're Building" icon="rocket-outline" />

      {safeGoals.map((goal, i) => (
        <View
          key={i}
          className="bg-surface rounded-2xl px-4 py-4 mb-3 flex-row items-start gap-3.5"
        >
          <View className="w-9 h-9 rounded-2xl bg-primary-soft items-center justify-center mt-0.5">
            <Ionicons
              name={getIcon(goal.category)}
              size={17}
              color={theme.colors["--color-primary"]}
            />
          </View>
          <View className="flex-1">
            <View className="flex-row items-start justify-between gap-2">
              <Text className="text-foreground text-sm font-sans leading-relaxed flex-1">
                {goal.description}
              </Text>
              <View
                className={`px-2.5 py-0.5 rounded-full ${colorClass(goal.category)}`}
              >
                <Text className="text-xs font-sans-medium capitalize">
                  {goal.category}
                </Text>
              </View>
            </View>
            {goal.progressNotes ? (
              <Text className="text-muted text-xs font-sans mt-1.5 leading-relaxed">
                {goal.progressNotes}
              </Text>
            ) : null}
          </View>
        </View>
      ))}

      {completeness === "fuzzy" && (
        <CompletenessNudge section="work" prompt="" />
      )}
    </View>
  );
}
