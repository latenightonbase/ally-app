import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SectionHeader } from "./SectionHeader";
import { useTheme } from "../../context/ThemeContext";

interface UpcomingEvent {
  id: string;
  content: string;
  eventDate: string;
  context: string | null;
}

interface ComingUpSectionProps {
  events: UpcomingEvent[];
}

function formatEventDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.ceil(
    (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7)
    return date.toLocaleDateString("en-US", { weekday: "long" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ComingUpSection({ events }: ComingUpSectionProps) {
  const safeEvents = Array.isArray(events) ? events : [];
  if (safeEvents.length === 0) return null;

  const { theme } = useTheme();

  return (
    <View className="mb-4">
      <SectionHeader title="Coming Up" />

      {safeEvents.map((ev) => (
        <View
          key={ev.id}
          className="bg-surface rounded-2xl px-4 py-3.5 mb-2.5 flex-row items-start gap-3"
        >
          <View className="w-8 h-8 rounded-xl bg-primary-soft items-center justify-center mt-0.5">
            <Ionicons
              name="calendar-outline"
              size={15}
              color={theme.colors["--color-primary"]}
            />
          </View>
          <View className="flex-1">
            <Text className="text-foreground text-sm font-sans leading-relaxed">
              {ev.content}
            </Text>
            <Text className="text-primary text-xs font-sans-medium mt-1">
              {formatEventDate(ev.eventDate)}
            </Text>
            {ev.context && (
              <Text className="text-muted text-xs font-sans mt-0.5">
                {ev.context}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}
