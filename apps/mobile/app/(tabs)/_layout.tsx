import React from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";
import { SettingsSheet } from "../../components/settings/SettingsSheet";

export default function TabLayout() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors["--color-background"] }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            position: "absolute",
            bottom: Math.max(insets.bottom, Platform.OS === "ios" ? 16 : 12),
            marginHorizontal: 20,
            height: 64,
            borderRadius: 24,
            paddingBottom: 0,
            paddingTop: 10,
            borderTopWidth: 0,
            backgroundColor: colors["--color-surface"],
            elevation: 12,
            shadowColor: "#2D1F16",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: theme.isDark ? 0.35 : 0.18,
            shadowRadius: 24,
          },
          tabBarActiveTintColor: colors["--color-primary"],
          tabBarInactiveTintColor: colors["--color-muted"],
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize: 9,
            fontWeight: "700",
            lineHeight: 11,
            marginTop: 3,
          },
        }}
        screenListeners={{
          tabPress: () => {
            Haptics.selectionAsync();
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "home" : "home-outline"}
                size={22}
                color={color}
                style={{ transform: [{ translateY: focused ? -1 : 0 }] }}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: "Calendar",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "calendar" : "calendar-outline"}
                size={22}
                color={color}
                style={{ transform: [{ translateY: focused ? -1 : 0 }] }}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="lists"
          options={{
            title: "Lists",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "list" : "list-outline"}
                size={22}
                color={color}
                style={{ transform: [{ translateY: focused ? -1 : 0 }] }}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="family"
          options={{
            title: "Family",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "people" : "people-outline"}
                size={22}
                color={color}
                style={{ transform: [{ translateY: focused ? -1 : 0 }] }}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: "Chat",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={
                  focused
                    ? "chatbubble-ellipses"
                    : "chatbubble-ellipses-outline"
                }
                size={22}
                color={color}
                style={{ transform: [{ translateY: focused ? -1 : 0 }] }}
              />
            ),
          }}
        />
      </Tabs>
      <SettingsSheet />
    </View>
  );
}
