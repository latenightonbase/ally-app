import React, { useState } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { OnboardingShell } from "../../components/onboarding/OnboardingShell";
import { PrimaryCTA } from "../../components/onboarding/PrimaryCTA";
import { ChoiceRow } from "../../components/onboarding/ChoiceRow";
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
  const setDailyPingTime = useOnboardingStore((s) => s.setDailyPingTime);
  const [selected, setSelected] = useState("07:30");

  const handleSelect = (value: string) => {
    Haptics.selectionAsync();
    setSelected(value);
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDailyPingTime(selected);
    router.push("/(onboarding)/magic-moment");
  };

  return (
    <OnboardingShell
      step={4}
      totalSteps={7}
      footer={<PrimaryCTA title="Continue" onPress={handleNext} />}
    >
      <View className="mt-4">
        <Text className="text-foreground text-3xl font-sans-bold leading-tight mb-3">
          When should I{"\n"}check in?
        </Text>
        <Text className="text-muted text-base font-sans leading-6 mb-8">
          Every morning, Anzi sends a summary of the day ahead for your whole
          family. Pick a time that works.
        </Text>
      </View>

      <View className="gap-2.5">
        {TIME_OPTIONS.map((option) => (
          <ChoiceRow
            key={option.value}
            label={option.label}
            leading={option.emoji}
            selected={selected === option.value}
            onPress={() => handleSelect(option.value)}
          />
        ))}
      </View>
    </OnboardingShell>
  );
}
