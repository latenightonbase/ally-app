import React from "react";
import { View } from "react-native";
import { MotiView } from "moti";
import { Avatar } from "../ui/Avatar";
import { useTheme } from "../../context/ThemeContext";

export function TypingIndicator() {
  const { theme } = useTheme();

  return (
    <View className="flex-row items-end mb-3">
      <View style={{ marginRight: 8 }}>
        <Avatar name="A" size="sm" color={theme.colors["--color-primary"]} />
      </View>
      <View
        className="flex-row items-center"
        style={{
          backgroundColor: theme.colors["--color-surface"],
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderBottomLeftRadius: 4,
          borderBottomRightRadius: 20,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: theme.colors["--color-border"],
        }}
      >
        {[0, 1, 2].map((i) => (
          <MotiView
            key={i}
            from={{ opacity: 0.35, translateY: 0 }}
            animate={{ opacity: 1, translateY: -3 }}
            transition={{
              type: "timing",
              duration: 420,
              loop: true,
              delay: i * 140,
              repeatReverse: true,
            }}
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              marginHorizontal: 2,
              backgroundColor: theme.colors["--color-faint"],
            }}
          />
        ))}
      </View>
    </View>
  );
}
