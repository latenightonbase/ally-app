import React from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Button } from "../../components/ui/Button";
import { useTheme } from "../../context/ThemeContext";
import { useOnboardingStore } from "@/store/useOnboardingStore";

export default function OnboardingFamilyScreen() {
  const { theme } = useTheme();
  const setFamilyMembers = useOnboardingStore((s) => s.setFamilyMembers);

  const handleNext = () => {
    setFamilyMembers([]);
    router.push("/(onboarding)/challenges");
  };

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top", "bottom"]} className="flex-1">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          className="px-8 pt-12"
        >
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 500 }}
          >
            <Text className="text-foreground text-3xl font-sans-bold mb-3">
              Your family on Anzi
            </Text>
            <Text className="text-muted text-base font-sans leading-6 mb-8">
              Once you're set up, you can invite your partner and family members
              to join Anzi. Everyone gets their own chat with Anzi and can add
              to shared lists, tasks, and the family calendar.
            </Text>

            <View className="bg-surface rounded-2xl p-5 mb-4 border border-border/30">
              <View className="flex-row items-center mb-3">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: theme.colors["--color-primary"] + "20" }}
                >
                  <Ionicons
                    name="link-outline"
                    size={20}
                    color={theme.colors["--color-primary"]}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-foreground font-sans-semibold text-base">
                    Invite via link
                  </Text>
                  <Text className="text-muted text-sm font-sans">
                    Share a link so they can join your family
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center mb-3">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: theme.colors["--color-primary"] + "20" }}
                >
                  <Ionicons
                    name="chatbubbles-outline"
                    size={20}
                    color={theme.colors["--color-primary"]}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-foreground font-sans-semibold text-base">
                    Everyone chats with Anzi
                  </Text>
                  <Text className="text-muted text-sm font-sans">
                    Each member can ask Anzi to add tasks, events, and more
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: theme.colors["--color-primary"] + "20" }}
                >
                  <Ionicons
                    name="people-outline"
                    size={20}
                    color={theme.colors["--color-primary"]}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-foreground font-sans-semibold text-base">
                    Shared family data
                  </Text>
                  <Text className="text-muted text-sm font-sans">
                    Lists, calendar, and tasks stay in sync for everyone
                  </Text>
                </View>
              </View>
            </View>

            <Text className="text-muted text-sm font-sans text-center mt-2 mb-6">
              You can invite family members from the Family tab after setup.
            </Text>
          </MotiView>

          <View className="mt-auto pb-8">
            <Button title="Next" onPress={handleNext} size="lg" />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
