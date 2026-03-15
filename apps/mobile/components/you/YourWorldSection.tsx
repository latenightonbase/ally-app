import React from "react";
import { View, Text } from "react-native";
import { SectionHeader } from "./SectionHeader";
import { CompletenessNudge } from "./CompletenessNudge";

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

export function YourWorldSection({
  relationships,
  completeness,
}: YourWorldSectionProps) {
  const safeRelationships = Array.isArray(relationships) ? relationships : [];
  return (
    <View className="mb-4">
      <SectionHeader title="Your World" />

      {safeRelationships.map((rel, i) => (
        <View
          key={`${rel.name}-${i}`}
          className="bg-surface rounded-2xl px-4 py-3.5 mb-2.5"
        >
          <View className="flex-row items-center gap-2 mb-1">
            <Text className="text-foreground text-base font-sans-semibold">
              {rel.name}
            </Text>
            <View className="bg-primary-soft px-2 py-0.5 rounded-full">
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
      ))}

      {completeness === "fuzzy" && (
        <CompletenessNudge section="relationships" prompt="" />
      )}
    </View>
  );
}
