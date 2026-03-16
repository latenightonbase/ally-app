import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SectionHeader } from "./SectionHeader";
import { useTheme } from "../../context/ThemeContext";

interface DynamicAttribute {
  value: string;
  confidence: number;
  learnedAt: string;
}

interface WhatAllyNoticesSectionProps {
  dynamicAttributes: Record<string, DynamicAttribute>;
  allyName: string;
}

function formatAttributeKey(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  return (
    <View className="flex-row items-center gap-2 mt-1">
      <View className="flex-1 h-1 bg-primary-soft rounded-full overflow-hidden">
        <View
          className="h-full bg-primary rounded-full"
          style={{ width: `${pct}%` }}
        />
      </View>
      <Text className="text-muted text-xs font-sans" style={{ minWidth: 32 }}>
        {pct}%
      </Text>
    </View>
  );
}

export function WhatAllyNoticesSection({
  dynamicAttributes,
  allyName,
}: WhatAllyNoticesSectionProps) {
  const entries = Object.entries(dynamicAttributes);
  if (entries.length === 0) return null;

  const { theme } = useTheme();

  // Sort by confidence descending
  const sorted = entries.sort(([, a], [, b]) => b.confidence - a.confidence);

  return (
    <View className="mb-6">
      <SectionHeader title={`What ${allyName} Notices`} icon="eye-outline" />

      <View className="bg-surface rounded-2xl px-4 py-5">
        <View className="flex-row items-start gap-2.5 mb-4">
          <Ionicons
            name="sparkles-outline"
            size={14}
            color={theme.colors["--color-muted"]}
          />
          <Text className="text-muted text-xs font-sans leading-relaxed flex-1">
            These are patterns {allyName} has quietly picked up — things you
            never explicitly said.
          </Text>
        </View>

        {sorted.map(([key, attr], i) => (
          <View
            key={key}
            className={i < sorted.length - 1 ? "mb-5 pb-5 border-b border-primary-soft/30" : ""}
          >
            <Text className="text-foreground text-sm font-sans-semibold">
              {formatAttributeKey(key)}
            </Text>
            <Text className="text-muted text-sm font-sans leading-relaxed mt-1.5">
              {attr.value}
            </Text>
            <ConfidenceBar confidence={attr.confidence} />
          </View>
        ))}
      </View>
    </View>
  );
}
