import React from "react";
import { Stack } from "expo-router";
import { useTheme } from "../../context/ThemeContext";

export default function OnboardingLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: {
          backgroundColor: theme.colors["--color-background"],
        },
      }}
    />
  );
}
