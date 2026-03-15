import React, { useState, useCallback } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SectionHeader } from "./SectionHeader";
import { useTheme } from "../../context/ThemeContext";
import { deleteMemoryFact } from "../../lib/api";

interface Episode {
  id: string;
  content: string;
  emotion: string | null;
  category: string;
  date: string;
}

interface RecentStorySectionProps {
  episodes: Episode[];
  onDelete?: (id: string) => void;
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecentStorySection({
  episodes,
  onDelete,
}: RecentStorySectionProps) {
  const safeEpisodes = Array.isArray(episodes) ? episodes : [];
  if (safeEpisodes.length === 0) return null;

  const { theme } = useTheme();

  const handleLongPress = useCallback(
    (ep: Episode) => {
      Alert.alert("Remove from story?", ep.content.slice(0, 80) + "…", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMemoryFact(ep.id);
              onDelete?.(ep.id);
            } catch {
              Alert.alert("Error", "Could not remove this story entry.");
            }
          },
        },
      ]);
    },
    [onDelete],
  );

  return (
    <View className="mb-4">
      <SectionHeader title="Recent Story" />

      {safeEpisodes.map((ep, i) => (
        <Pressable
          key={ep.id}
          onLongPress={() => handleLongPress(ep)}
          delayLongPress={400}
          className="active:opacity-80"
        >
          <View className="flex-row gap-3 mb-3">
            {/* Timeline line */}
            <View className="items-center" style={{ width: 20 }}>
              <View
                className="w-2.5 h-2.5 rounded-full mt-1"
                style={{ backgroundColor: theme.colors["--color-primary"] }}
              />
              {i < safeEpisodes.length - 1 && (
                <View
                  className="flex-1 w-px mt-1"
                  style={{
                    backgroundColor: theme.colors["--color-primary"] + "30",
                    minHeight: 16,
                  }}
                />
              )}
            </View>

            <View className="flex-1 pb-1">
              <Text className="text-foreground text-sm font-sans leading-relaxed">
                {ep.content}
              </Text>
              <View className="flex-row items-center gap-2 mt-1">
                <Text className="text-muted text-xs font-sans">
                  {formatRelativeDate(ep.date)}
                </Text>
                {ep.emotion && (
                  <View className="bg-primary-soft px-1.5 py-0.5 rounded-full">
                    <Text className="text-primary text-xs font-sans capitalize">
                      {ep.emotion}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
