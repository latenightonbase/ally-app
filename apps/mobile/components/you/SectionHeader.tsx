import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";

interface SectionHeaderProps {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  subtitle?: string;
}

export function SectionHeader({ title, icon, subtitle }: SectionHeaderProps) {
  const { theme } = useTheme();

  return (
    <View className="mb-4 mt-3">
      <View className="flex-row items-center gap-2.5 px-1">
        {icon && (
          <View className="w-7 h-7 rounded-xl bg-primary-soft items-center justify-center">
            <Ionicons
              name={icon}
              size={15}
              color={theme.colors["--color-primary"]}
            />
          </View>
        )}
        <Text className="text-muted text-xs font-sans-semibold uppercase tracking-widest">
          {title}
        </Text>
      </View>
      {subtitle && (
        <Text className="text-muted text-xs font-sans mt-1.5 px-1 opacity-70">
          {subtitle}
        </Text>
      )}
    </View>
  );
}
