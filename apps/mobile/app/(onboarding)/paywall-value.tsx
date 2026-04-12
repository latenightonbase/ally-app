import React from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Button } from "../../components/ui/Button";
import { ProgressBackground } from "../../components/onboarding/ProgressBackground";

const FEATURES = [
  {
    emoji: "🧠",
    title: "She remembers everything",
    body: "Names, dates, goals, conversations — Anzi builds a living memory of your life so you never lose track.",
  },
  {
    emoji: "☀️",
    title: "Daily briefings, just for you",
    body: "Every morning, Anzi surfaces exactly what you need to know: reminders, priorities, and a check-in on how you're doing.",
  },
  {
    emoji: "💬",
    title: "Always there to listen",
    body: "Vent, process, or just talk. Anzi meets you where you are, without judgment, 24/7.",
  },
  {
    emoji: "🔔",
    title: "Reminders that actually make sense",
    body: "Not just alarms — Anzi knows the context behind every reminder and tells you why it matters.",
  },
];

export default function PaywallValueScreen() {
  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/(onboarding)/paywall-trial");
  };

  return (
    <View className="flex-1 bg-background">
      <ProgressBackground progress={0.85} />

      <SafeAreaView edges={["top", "bottom"]} className="flex-1">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-1 px-8 pt-12 pb-8">
            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 600 }}
              className="items-center mb-10"
            >
              <Text className="text-5xl mb-4">🌟</Text>
              <Text className="text-foreground text-3xl font-sans-bold text-center mb-3">
                Anzi never sleeps.{"\n"}Neither does your life.
              </Text>
              <Text className="text-muted text-base font-sans text-center leading-6">
                Here's what you unlock when you go premium — built around
                everything you just told us.
              </Text>
            </MotiView>

            <View className="gap-5 mb-10">
              {FEATURES.map((feat, i) => (
                <MotiView
                  key={feat.title}
                  from={{ opacity: 0, translateX: -16 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  transition={{ type: "timing", duration: 500, delay: i * 100 }}
                  className="flex-row gap-4 bg-surface rounded-2xl p-4 border border-primary/10"
                >
                  <Text className="text-3xl">{feat.emoji}</Text>
                  <View className="flex-1">
                    <Text className="text-foreground text-base font-sans-semibold mb-1">
                      {feat.title}
                    </Text>
                    <Text className="text-muted text-sm font-sans leading-5">
                      {feat.body}
                    </Text>
                  </View>
                </MotiView>
              ))}
            </View>

            <Button
              title="This is what I need →"
              onPress={handleContinue}
              size="lg"
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
