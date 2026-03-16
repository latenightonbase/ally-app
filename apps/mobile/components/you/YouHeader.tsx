import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "../ui/Avatar";
import { useTheme } from "../../context/ThemeContext";

interface YouHeaderProps {
  name: string | null;
  role: string | null;
  location: string | null;
  allyName: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function YouHeader({ name, role, location, allyName }: YouHeaderProps) {
  const displayName = name || "You";
  const { theme } = useTheme();

  const subtitle = [role, location].filter(Boolean).join(" · ");

  return (
    <View className="items-center mb-8 pt-2">
      <Avatar name={displayName} size="lg" />
      <Text className="text-muted text-sm font-sans mt-3">
        {getGreeting()},
      </Text>
      <Text className="text-foreground text-2xl font-sans-bold mt-0.5">
        {displayName}
      </Text>
      {subtitle ? (
        <View className="flex-row items-center gap-1.5 mt-1.5">
          <Ionicons
            name="location-outline"
            size={13}
            color={theme.colors["--color-muted"]}
          />
          <Text className="text-muted text-sm font-sans" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      ) : null}
      <View className="flex-row items-center gap-1.5 mt-2 bg-primary-soft px-3.5 py-1.5 rounded-full">
        <Ionicons
          name="sparkles-outline"
          size={12}
          color={theme.colors["--color-primary"]}
        />
        <Text className="text-primary text-xs font-sans-medium">
          as seen by {allyName}
        </Text>
      </View>
    </View>
  );
}
