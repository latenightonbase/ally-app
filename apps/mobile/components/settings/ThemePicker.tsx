import React from "react";
import { View, Text, Pressable } from "react-native";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { THEMES, type ThemeId } from "../../constants/themes";

interface ThemePickerProps {
  activeTheme: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
}

export function ThemePicker({ activeTheme, onSelectTheme }: ThemePickerProps) {
  const handleSelect = (id: ThemeId) => {
    Haptics.selectionAsync();
    onSelectTheme(id);
  };

  return (
    <View className="mb-6">
      <Text className="text-foreground text-base font-sans-semibold mb-3 px-1">
        Appearance
      </Text>
      <View className="flex-row flex-wrap gap-3">
        {THEMES.map((theme) => {
          const isActive = theme.id === activeTheme;
          return (
            <Pressable
              key={theme.id}
              onPress={() => handleSelect(theme.id)}
              className="items-center"
            >
              <View
                className={`w-14 h-14 rounded-2xl items-center justify-center border-2 ${
                  isActive ? "border-primary" : "border-transparent"
                }`}
                style={{ backgroundColor: theme.preview.background }}
              >
                <View
                  className="w-6 h-6 rounded-full"
                  style={{ backgroundColor: theme.preview.primary }}
                />
                {isActive && (
                  <View className="absolute">
                    <Ionicons
                      name="checkmark-circle"
                      size={14}
                      color={theme.preview.primary}
                    />
                  </View>
                )}
              </View>
              <Text
                className="text-muted text-[10px] font-sans-medium mt-1 text-center"
                numberOfLines={1}
                style={{ width: 56 }}
              >
                {theme.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
