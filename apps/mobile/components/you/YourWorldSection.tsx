import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SectionHeader } from "./SectionHeader";
import { CompletenessNudge } from "./CompletenessNudge";
import { useTheme } from "../../context/ThemeContext";

interface Relationship {
  name: string;
  relation: string;
  notes: string;
  lastMentioned: string | null;
}

interface YourWorldSectionProps {
  relationships: Relationship[];
  completeness: "clear" | "emerging" | "fuzzy";
}

const RELATION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  partner: "heart-outline",
  spouse: "heart-outline",
  friend: "people-outline",
  family: "home-outline",
  parent: "home-outline",
  sibling: "home-outline",
  colleague: "briefcase-outline",
  coworker: "briefcase-outline",
  mentor: "school-outline",
};

export function YourWorldSection({
  relationships,
  completeness,
}: YourWorldSectionProps) {
  const safeRelationships = Array.isArray(relationships) ? relationships : [];
  const { theme } = useTheme();

  return (
    <View className="mb-6">
      <SectionHeader title="Your World" icon="people-outline" />

      {safeRelationships.map((rel, i) => {
        const iconName = RELATION_ICONS[rel.relation.toLowerCase()] ?? "person-outline";
        return (
          <View
            key={`${rel.name}-${i}`}
            className="bg-surface rounded-2xl px-4 py-4 mb-3 flex-row items-start gap-3.5"
          >
            <View className="w-9 h-9 rounded-2xl bg-primary-soft items-center justify-center mt-0.5">
              <Ionicons
                name={iconName}
                size={17}
                color={theme.colors["--color-primary"]}
              />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-2 mb-1">
                <Text className="text-foreground text-base font-sans-semibold">
                  {rel.name}
                </Text>
                <View className="bg-primary-soft px-2.5 py-0.5 rounded-full">
                  <Text className="text-primary text-xs font-sans-medium capitalize">
                    {rel.relation}
                  </Text>
                </View>
              </View>
              {rel.notes ? (
                <Text className="text-muted text-sm font-sans leading-relaxed">
                  {rel.notes}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}

      {completeness === "fuzzy" && (
        <CompletenessNudge section="relationships" prompt="" />
      )}
    </View>
  );
}
