import "../global.css";
import React, { useEffect, useMemo } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { vars } from "nativewind";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { GestureHandlerRootView } from "react-native-gesture-handler";

SplashScreen.preventAutoHideAsync();

function RootNavigation() {
  const { theme } = useTheme();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  const themeVars = useMemo(() => vars(theme.colors), [theme.colors]);

  return (
    <View style={[{ flex: 1 }, themeVars]}>
      <StatusBar style={theme.isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          contentStyle: {
            backgroundColor: theme.colors["--color-background"],
          },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <RootNavigation />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
