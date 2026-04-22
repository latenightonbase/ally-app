import React, { useState } from "react";
import { View, Text, TextInput, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { OnboardingShell } from "../../components/onboarding/OnboardingShell";
import { PrimaryCTA } from "../../components/onboarding/PrimaryCTA";
import { useTheme } from "../../context/ThemeContext";
import { joinFamilyByCode, getFamily } from "../../lib/api";
import { useFamilyStore } from "../../store/useFamilyStore";

export default function FamilyJoinScreen() {
  const { theme } = useTheme();
  const setFamily = useFamilyStore((s) => s.setFamily);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = code.trim().length === 6 && !submitting;

  const handleJoin = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await joinFamilyByCode(code.trim());
      try {
        const { family, members } = await getFamily();
        setFamily(family, members);
      } catch {
        // Best-effort: tabs screen will refetch
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message =
        e instanceof Error
          ? e.message
          : "Could not join family. Check the code and try again.";
      setError(message);
      setSubmitting(false);
    }
  };

  const handleNoCode = () => {
    Alert.alert(
      "No code?",
      "Ask a family member to share their invite code with you — or go back and create your own family.",
    );
  };

  return (
    <OnboardingShell
      step={7}
      totalSteps={7}
      keyboardAvoiding
      footer={
        <View className="gap-2">
          <PrimaryCTA
            title={submitting ? "Joining..." : "Join family"}
            onPress={handleJoin}
            icon="enter"
            disabled={!canSubmit}
          />
          <PrimaryCTA
            title="I don't have a code"
            onPress={handleNoCode}
            variant="ghost"
          />
        </View>
      }
    >
      <View className="mt-4">
        <Text className="text-foreground text-3xl font-sans-bold leading-tight mb-3">
          Enter your code.
        </Text>
        <Text className="text-muted text-base font-sans leading-6 mb-8">
          Pop in the 6-character invite code a family member sent you.
        </Text>
      </View>

      <View
        style={{
          backgroundColor: theme.colors["--color-surface"],
          borderRadius: 20,
          padding: 20,
          borderWidth: 1,
          borderColor: theme.colors["--color-border"],
        }}
      >
        <Text
          className="text-xs font-sans-bold mb-3"
          style={{
            color: theme.colors["--color-muted"],
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          Invite code
        </Text>
        <TextInput
          value={code}
          onChangeText={(t) => {
            setCode(t.toUpperCase().replace(/\s/g, ""));
            setError(null);
          }}
          placeholder="A3KX7Q"
          placeholderTextColor={theme.colors["--color-faint"]}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          autoFocus
          className="font-sans-bold text-center"
          style={{
            letterSpacing: 10,
            fontSize: 26,
            color: theme.colors["--color-foreground"],
            backgroundColor: theme.colors["--color-background"],
            borderWidth: 2,
            borderColor: error
              ? theme.colors["--color-danger"]
              : theme.colors["--color-primary-soft"],
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 16,
          }}
        />
        {error && (
          <Text
            className="text-sm font-sans mt-3"
            style={{ color: theme.colors["--color-danger"] }}
          >
            {error}
          </Text>
        )}
        {submitting && (
          <View className="items-center mt-3">
            <ActivityIndicator color={theme.colors["--color-primary"]} />
          </View>
        )}
      </View>
    </OnboardingShell>
  );
}
