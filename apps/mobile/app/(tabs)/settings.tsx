import React, { useState } from "react";
import { ScrollView, View, Text, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { router } from "expo-router";
import { useTheme } from "../../context/ThemeContext";
import { useAppStore } from "../../store/useAppStore";
import { ThemePicker } from "../../components/settings/ThemePicker";
import { SubscriptionCard } from "../../components/settings/SubscriptionCard";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { authClient, useSession } from "../../lib/auth";
import { deleteMemoryProfile } from "../../lib/api";

export default function SettingsScreen() {
  const { themeId, setTheme } = useTheme();
  const user = useAppStore((s) => s.user);
  const resetOnboarding = useAppStore((s) => s.resetOnboarding);
  const { data: session } = useSession();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        onPress: async () => {
          await authClient.signOut();
          resetOnboarding();
          router.replace("/");
        },
      },
    ]);
  };

  const handleResetOnboarding = () => {
    Alert.alert(
      `Reset ${user.allyName || "Ally"}`,
      "This will erase all memories and take you back to the beginning. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMemoryProfile();
            } catch {
              // Profile deletion failure shouldn't block local reset
            }
            resetOnboarding();
            router.replace("/");
          },
        },
      ],
    );
  };

  const handleResetMemories = () => {
    Alert.alert(
      "Clear Memories",
      `This will erase all of ${user.allyName || "Ally"}'s memories about you. Your chat history will remain. Are you sure?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMemoryProfile();
            } catch {
              Alert.alert("Error", "Could not clear memories. Please try again.");
            }
          },
        },
      ],
    );
  };

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top"]} className="flex-1">
        <ScrollView
          className="flex-1 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: 300 }}
            className="mb-6"
          >
            <Text className="text-foreground text-2xl font-sans-bold mb-1">
              Settings
            </Text>
            <Text className="text-muted text-sm font-sans">
              Hi {user.name}, manage your {user.allyName || "Ally"} experience here.
            </Text>
          </MotiView>

          {/* Theme Picker */}
          <ThemePicker activeTheme={themeId} onSelectTheme={setTheme} />

          {/* Notifications Section */}
          <Text className="text-foreground text-base font-sans-semibold mb-3 px-1">
            Notifications
          </Text>
          <SettingsRow
            icon="notifications-outline"
            label="Morning Briefing"
            isToggle
            toggleValue={notificationsEnabled}
            onToggle={setNotificationsEnabled}
          />
          <SettingsRow
            icon="time-outline"
            label="Briefing Time"
            value={user.briefingTime}
            showChevron
            onPress={() => {}}
          />

          {/* Subscription */}
          <Text className="text-foreground text-base font-sans-semibold mb-3 mt-6 px-1">
            Subscription
          </Text>
          <SubscriptionCard />

          {/* Account Section */}
          <Text className="text-foreground text-base font-sans-semibold mb-3 mt-6 px-1">
            Account
          </Text>
          <SettingsRow
            icon="person-outline"
            label="Name"
            value={session?.user?.name ?? user.name}
            showChevron
            onPress={() => {}}
          />
          <SettingsRow
            icon="mail-outline"
            label="Email"
            value={session?.user?.email ?? ""}
            onPress={() => {}}
          />
          <SettingsRow
            icon="briefcase-outline"
            label="Occupation"
            value={user.job}
            showChevron
            onPress={() => {}}
          />
          <SettingsRow
            icon="trash-outline"
            label="Clear All Memories"
            onPress={handleResetMemories}
            danger
          />
          <SettingsRow
            icon="refresh-outline"
            label={`Reset ${user.allyName || "Ally"}`}
            onPress={handleResetOnboarding}
            danger
          />
          <SettingsRow
            icon="log-out-outline"
            label="Sign Out"
            onPress={handleSignOut}
            danger
          />

          {/* App Info */}
          <View className="items-center mt-8 mb-4">
            <Text className="text-muted text-xs font-sans">
              {user.allyName || "Ally"} v1.0.0
            </Text>
            <Text className="text-muted/50 text-xs font-sans mt-1">
              The friend who never forgets
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
