import React, { useState } from "react";
import { View, Text } from "react-native";
import { MotiView } from "moti";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Chip } from "../../components/ui/Chip";
import { OnboardingShell } from "../../components/onboarding/OnboardingShell";
import { PrimaryCTA } from "../../components/onboarding/PrimaryCTA";
import { useOnboardingStore } from "../../store/useOnboardingStore";

const CHALLENGE_OPTIONS = [
  "Scheduling conflicts",
  "Grocery & meal planning",
  "Homework & school stuff",
  "Activities & sports",
  "Doctor appointments",
  "Family communication",
  "Permission slips & forms",
  "Morning routine chaos",
  "Carpool coordination",
  "Chore distribution",
];

export default function OnboardingChallengesScreen() {
  const setChallenges = useOnboardingStore((s) => s.setChallenges);
  const [selected, setSelected] = useState<string[]>([]);

  const toggleChallenge = (challenge: string) => {
    Haptics.selectionAsync();
    setSelected((prev) =>
      prev.includes(challenge)
        ? prev.filter((c) => c !== challenge)
        : [...prev, challenge],
    );
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChallenges(selected);
    router.push("/(onboarding)/briefing-time");
  };

  const counterText =
    selected.length === 0
      ? "Pick as many as apply"
      : `${selected.length} selected`;

  return (
    <OnboardingShell
      step={3}
      totalSteps={6}
      footer={
        <PrimaryCTA
          title="Continue"
          onPress={handleNext}
          disabled={selected.length === 0}
        />
      }
    >
      <View className="mt-4">
        <Text className="text-foreground text-3xl font-sans-bold leading-tight mb-3">
          What falls through{"\n"}the cracks?
        </Text>
        <Text className="text-muted text-base font-sans leading-6 mb-6">
          Pick the things that stress you out most. This helps Anzi know where
          to focus.
        </Text>

        <MotiView
          key={`counter-${selected.length}`}
          from={{ opacity: 0, translateY: -4 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 220 }}
          className="mb-4"
        >
          <Text
            className={`text-xs font-sans-semibold tracking-widest uppercase ${
              selected.length > 0 ? "text-primary" : "text-muted"
            }`}
          >
            {counterText}
          </Text>
        </MotiView>
      </View>

      <View className="flex-row flex-wrap">
        {CHALLENGE_OPTIONS.map((challenge) => (
          <Chip
            key={challenge}
            label={challenge}
            selected={selected.includes(challenge)}
            onPress={() => toggleChallenge(challenge)}
          />
        ))}
      </View>
    </OnboardingShell>
  );
}
