import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Button } from "../../components/ui/Button";
import { useTheme } from "../../context/ThemeContext";
import { useOnboardingStore } from "../../store/useOnboardingStore";

const TIME_OPTIONS = [
  { label: "6:00 AM", value: "06:00", emoji: "🌅" },
  { label: "6:30 AM", value: "06:30", emoji: "🌅" },
  { label: "7:00 AM", value: "07:00", emoji: "☀️" },
  { label: "7:30 AM", value: "07:30", emoji: "☀️" },
  { label: "8:00 AM", value: "08:00", emoji: "☀️" },
  { label: "8:30 AM", value: "08:30", emoji: "🌤️" },
  { label: "9:00 AM", value: "09:00", emoji: "🌤️" },
];

export default function OnboardingBriefingTimeScreen() {
  const { theme } = useTheme();
  const setDailyPingTime = useOnboardingStore((s) => s.setDailyPingTime);
  const [selected, setSelected] = useState("07:30");

  const handleNext = () => {
    setDailyPingTime(selected);
    router.push("/(onboarding)/magic-moment");
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
              Morning briefing time
            </Text>
            <Text className="text-muted text-base font-sans leading-6 mb-8">
              Every morning, Anzi will send you a summary of the day ahead for
              your whole family. When should it arrive?
            </Text>

            <View className="gap-2">
              {TIME_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setSelected(option.value)}
                  className={`flex-row items-center p-4 rounded-2xl border ${
                    selected === option.value
                      ? "bg-primary/10 border-primary"
                      : "bg-surface border-border/30"
                  }`}
                >
                  <Text className="text-xl mr-3">{option.emoji}</Text>
                  <Text
                    className={`text-base font-sans-semibold flex-1 ${
                      selected === option.value
                        ? "text-primary"
                        : "text-foreground"
                    }`}
                  >
                    {option.label}
                  </Text>
                  {selected === option.value && (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={theme.colors["--color-primary"]}
                    />
                  )}
                </Pressable>
              ))}
            </View>
          </MotiView>

          <View className="mt-auto pb-8">
            <Button title="Next" onPress={handleNext} size="lg" />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
