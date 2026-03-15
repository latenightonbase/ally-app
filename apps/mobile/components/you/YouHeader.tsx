import React from "react";
import { View, Text } from "react-native";
import { Avatar } from "../ui/Avatar";

interface YouHeaderProps {
  name: string | null;
  role: string | null;
  location: string | null;
  allyName: string;
}

export function YouHeader({ name, role, location, allyName }: YouHeaderProps) {
  const displayName = name || "You";

  const subtitle = [role, location].filter(Boolean).join(" · ");

  return (
    <View className="flex-row items-center gap-4 mb-6">
      <Avatar name={displayName} size="lg" />
      <View className="flex-1">
        <Text className="text-foreground text-2xl font-sans-bold leading-tight">
          {displayName}
        </Text>
        {subtitle ? (
          <Text className="text-muted text-sm font-sans mt-0.5" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <Text className="text-primary text-xs font-sans-medium mt-1">
          as seen by {allyName}
        </Text>
      </View>
    </View>
  );
}
