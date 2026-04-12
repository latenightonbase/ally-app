import React from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Button } from "../../components/ui/Button";
import { ProgressBackground } from "../../components/onboarding/ProgressBackground";

const TRIAL_PERKS = [
  "Full access to all features — no limits",
  "Daily briefings & smart reminders",
  "Unlimited memory & conversations",
  "Cancel anytime before day 7",
];

export default function PaywallTrialScreen() {
  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/(onboarding)/paywall-pricing");
  };

  return (
    <View className="flex-1 bg-background">
      <ProgressBackground progress={0.9} />

      <SafeAreaView edges={["top", "bottom"]} className="flex-1">
        <View className="flex-1 justify-center px-8">
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 600 }}
            className="items-center"
          >
            <Text className="text-6xl mb-6">⏳</Text>
            <Text className="text-foreground text-3xl font-sans-bold text-center mb-4">
              Try Anzi free{"\n"}for 7 days
            </Text>
            <Text className="text-muted text-base font-sans text-center leading-6 mb-10">
              We want you to fall in love with Anzi before you pay a single
              cent. That's why you get a full week, on us.
            </Text>

            {/* Trial perks */}
            <View className="w-full bg-surface border border-primary/15 rounded-3xl p-6 mb-10 gap-4">
              {TRIAL_PERKS.map((perk, i) => (
                <MotiView
                  key={perk}
                  from={{ opacity: 0, translateX: -10 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  transition={{ type: "timing", duration: 400, delay: i * 80 }}
                  className="flex-row items-center gap-3"
                >
                  <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
                    <Text className="text-white text-xs font-sans-bold">✓</Text>
                  </View>
                  <Text className="text-foreground text-base font-sans flex-1">
                    {perk}
                  </Text>
                </MotiView>
              ))}
            </View>

            {/* Timeline */}
            <View className="w-full flex-row justify-between mb-10">
              <View className="items-center flex-1">
                <View className="w-3 h-3 rounded-full bg-primary mb-2" />
                <Text className="text-primary text-xs font-sans-semibold text-center">
                  Today
                </Text>
                <Text className="text-muted text-xs font-sans text-center mt-1">
                  Trial starts
                </Text>
              </View>
              <View className="flex-1 items-center justify-start pt-1">
                <View className="h-0.5 bg-primary/30 w-full mt-1" />
              </View>
              <View className="items-center flex-1">
                <View className="w-3 h-3 rounded-full bg-muted/40 mb-2" />
                <Text className="text-muted text-xs font-sans-semibold text-center">
                  Day 6
                </Text>
                <Text className="text-muted text-xs font-sans text-center mt-1">
                  Reminder sent
                </Text>
              </View>
              <View className="flex-1 items-center justify-start pt-1">
                <View className="h-0.5 bg-primary/30 w-full mt-1" />
              </View>
              <View className="items-center flex-1">
                <View className="w-3 h-3 rounded-full bg-muted/40 mb-2" />
                <Text className="text-muted text-xs font-sans-semibold text-center">
                  Day 7
                </Text>
                <Text className="text-muted text-xs font-sans text-center mt-1">
                  Billing begins
                </Text>
              </View>
            </View>

            <Button
              title="Start My Free Trial →"
              onPress={handleContinue}
              size="lg"
            />

            <Text className="text-muted text-xs font-sans text-center mt-4 leading-5">
              No charge today. Cancel anytime before day 7 and you'll never be
              billed.
            </Text>
          </MotiView>
        </View>
      </SafeAreaView>
    </View>
  );
}
