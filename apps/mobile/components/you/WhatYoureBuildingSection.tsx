import React from "react";
import { View, Text } from "react-native";
import { SectionHeader } from "./SectionHeader";
import { CompletenessNudge } from "./CompletenessNudge";

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

export function WhatYoureBuildingSection({
  goals,
  completeness,
}: WhatYoureBuildingSectionProps) {
  const safeGoals = Array.isArray(goals) ? goals : [];
  if (safeGoals.length === 0 && completeness !== "fuzzy") return null;

  const colorClass =
    (cat: string) =>
      CATEGORY_COLORS[cat.toLowerCase()] ?? "bg-primary-soft text-primary";

  return (
    <View className="mb-4">
      <SectionHeader title="What You're Building" />

      {safeGoals.map((goal, i) => (
        <View
          key={i}
          className="bg-surface rounded-2xl px-4 py-3.5 mb-2.5"
        >
          <View className="flex-row items-start gap-2">
            <View className="flex-1">
              <Text className="text-foreground text-sm font-sans leading-relaxed">
                {goal.description}
              </Text>
              {goal.progressNotes ? (
                <Text className="text-muted text-xs font-sans mt-1">
                  {goal.progressNotes}
                </Text>
              ) : null}
            </View>
            <View
              className={`px-2 py-0.5 rounded-full ${colorClass(goal.category)}`}
            >
              <Text className="text-xs font-sans-medium capitalize">
                {goal.category}
              </Text>
            </View>
          </View>
        </View>
      ))}

      {completeness === "fuzzy" && (
        <CompletenessNudge section="work" prompt="" />
      )}
    </View>
  );
}
