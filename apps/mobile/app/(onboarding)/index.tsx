import React, { useState } from "react";
import { View, Text } from "react-native";
import { MotiView } from "moti";
import { Easing } from "react-native-reanimated";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { TextInput } from "../../components/ui/TextInput";
import { OnboardingShell } from "../../components/onboarding/OnboardingShell";
import { PrimaryCTA } from "../../components/onboarding/PrimaryCTA";
import { useAppStore } from "../../store/useAppStore";

export default function OnboardingNameScreen() {
  const setUser = useAppStore((s) => s.setUser);
  const existingName = useAppStore((s) => s.user.name);
  const [name, setName] = useState(existingName || "");

  const handleNext = () => {
    if (!name.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUser({ name: name.trim() });
    router.push("/(onboarding)/family");
  };

  return (
    <OnboardingShell
      step={1}
      totalSteps={6}
      keyboardAvoiding
      footer={
        <PrimaryCTA
          title="Let's begin"
          onPress={handleNext}
          disabled={!name.trim()}
        />
      }
    >
      {/* Avatar with breathing halo */}
      <View className="items-center mt-6 mb-8">
        <View className="relative w-24 h-24 items-center justify-center">
          <MotiView
            from={{ scale: 1, opacity: 0.25 }}
            animate={{ scale: 1.35, opacity: 0 }}
            transition={{
              type: "timing",
              duration: 2200,
              loop: true,
              easing: Easing.out(Easing.ease),
            }}
            className="absolute inset-0 rounded-full bg-primary"
          />
          <View className="w-24 h-24 rounded-full bg-primary items-center justify-center">
            <Text className="text-white text-3xl font-sans-bold">A</Text>
          </View>
        </View>
      </View>

      {/* Meta label */}
      <MotiView
        from={{ opacity: 0, translateY: 8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 500, delay: 200 }}
        className="items-center mb-4"
      >
        <View className="px-3 py-1 rounded-full bg-primary-soft">
          <Text className="text-primary text-xs font-sans-semibold tracking-widest uppercase">
            1-minute setup
          </Text>
        </View>
      </MotiView>

      {/* Headline */}
      <MotiView
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 550, delay: 280 }}
      >
        <Text className="text-foreground text-4xl font-sans-bold text-center leading-tight mb-3">
          Hey there.
        </Text>
        <Text className="text-muted text-base font-sans text-center leading-6 mb-10 px-2">
          I'm Anzi — your family's AI organizer. Let's get to know each other.
        </Text>
      </MotiView>

      {/* Input */}
      <MotiView
        from={{ opacity: 0, translateY: 10 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 450, delay: 420 }}
      >
        <TextInput
          label="What should I call you?"
          placeholder="Your first name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoFocus
          autoComplete="given-name"
          returnKeyType="done"
          onSubmitEditing={handleNext}
        />
      </MotiView>
    </OnboardingShell>
  );
}
