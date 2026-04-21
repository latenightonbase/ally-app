import React, { useState } from "react";
import { View, Text, TextInput as RNTextInput } from "react-native";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { OnboardingShell } from "../../components/onboarding/OnboardingShell";
import { PrimaryCTA } from "../../components/onboarding/PrimaryCTA";
import { useTheme } from "../../context/ThemeContext";
import { useOnboardingStore } from "../../store/useOnboardingStore";

export default function OnboardingMagicMomentScreen() {
  const { theme } = useTheme();
  const setMagicMoment = useOnboardingStore((s) => s.setMagicMoment);
  const [text, setText] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMagicMoment(text.trim());
    router.push("/(onboarding)/create-account");
  };

  const hasText = text.trim().length > 0;

  const footer = (
    <View>
      <PrimaryCTA
        title={hasText ? "Let's go" : "Skip for now"}
        onPress={handleContinue}
        icon={hasText ? "sparkles" : "arrow-forward"}
      />
      {!hasText && (
        <PrimaryCTA
          title="I'll tell you later"
          onPress={handleContinue}
          variant="ghost"
        />
      )}
    </View>
  );

  return (
    <OnboardingShell
      step={5}
      totalSteps={7}
      keyboardAvoiding
      footer={footer}
    >
      <View className="mt-4">
        <Text className="text-foreground text-3xl font-sans-bold leading-tight mb-3">
          One last thing.
        </Text>
        <Text className="text-muted text-base font-sans leading-6 mb-8">
          Tell me one thing you need to happen this week — and I'll make sure
          the right person knows about it.
        </Text>
      </View>

      {/* Text area */}
      <View
        className="rounded-2xl p-4 bg-surface"
        style={{
          borderWidth: isFocused ? 2 : 1,
          borderColor: isFocused
            ? theme.colors["--color-primary"]
            : theme.colors["--color-muted"] + "33",
        }}
      >
        <RNTextInput
          value={text}
          onChangeText={setText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={`"Jake has a dentist appointment Thursday at 3 — remind Mike Wednesday night."`}
          placeholderTextColor={theme.colors["--color-muted"] + "CC"}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          selectionColor={theme.colors["--color-primary"]}
          style={{
            color: theme.colors["--color-foreground"],
            fontSize: 16,
            lineHeight: 24,
            minHeight: 140,
            padding: 0,
          }}
        />
      </View>

      {/* Magic info card */}
      <MotiView
        from={{ opacity: 0, translateY: 8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 450, delay: 200 }}
        className="mt-4 rounded-2xl p-4 flex-row items-start"
        style={{ backgroundColor: theme.colors["--color-primary"] + "14" }}
      >
        <View
          className="w-9 h-9 rounded-xl items-center justify-center mr-3"
          style={{ backgroundColor: theme.colors["--color-primary"] + "26" }}
        >
          <Ionicons
            name="sparkles"
            size={18}
            color={theme.colors["--color-primary"]}
          />
        </View>
        <Text className="text-primary text-sm font-sans flex-1 leading-5 pt-1">
          This is where the magic starts. Anzi adds it to the calendar, sets
          reminders, and notifies the right people — automatically.
        </Text>
      </MotiView>
    </OnboardingShell>
  );
}
