import React, { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { router } from "expo-router";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
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
    setSelected((prev) =>
      prev.includes(challenge)
        ? prev.filter((c) => c !== challenge)
        : [...prev, challenge],
    );
  };

  const handleNext = () => {
    setChallenges(selected);
    router.push("/(onboarding)/briefing-time");
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
              What falls through the cracks?
            </Text>
            <Text className="text-muted text-base font-sans leading-6 mb-8">
              Pick the things that stress you out most. This helps Anzi know
              where to focus.
            </Text>

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
          </MotiView>

          <View className="mt-auto pb-8">
            <Button title="Next" onPress={handleNext} size="lg" />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
