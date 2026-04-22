import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "../../context/ThemeContext";

interface AvatarProps {
  name?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  color?: string;
  online?: boolean;
  textColor?: string;
}

const SIZE_PX: Record<NonNullable<AvatarProps["size"]>, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 52,
  xl: 72,
};

const TEXT_PX: Record<NonNullable<AvatarProps["size"]>, number> = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 18,
  xl: 26,
};

export function Avatar({
  name = "A",
  size = "md",
  className = "",
  color,
  online = false,
  textColor = "#ffffff",
}: AvatarProps) {
  const { theme } = useTheme();
  const px = SIZE_PX[size];
  const letter = name.charAt(0).toUpperCase();
  const bg = color ?? theme.colors["--color-primary"];

  return (
    <View style={{ position: "relative" }}>
      <View
        className={className}
        style={{
          width: px,
          height: px,
          borderRadius: px / 2,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          className="font-sans-bold"
          style={{ color: textColor, fontSize: TEXT_PX[size] }}
        >
          {letter}
        </Text>
      </View>
      {online && (
        <View
          style={{
            position: "absolute",
            right: -1,
            bottom: -1,
            width: Math.max(10, px * 0.26),
            height: Math.max(10, px * 0.26),
            borderRadius: Math.max(10, px * 0.26) / 2,
            backgroundColor: "#5B9B6B",
            borderWidth: 2,
            borderColor: theme.colors["--color-surface"],
          }}
        />
      )}
    </View>
  );
}
