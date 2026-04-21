import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Alert,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Haptics from "expo-haptics";
import { OnboardingShell } from "../../components/onboarding/OnboardingShell";
import { PrimaryCTA } from "../../components/onboarding/PrimaryCTA";
import { TextInput } from "../../components/ui/TextInput";
import { useTheme } from "../../context/ThemeContext";
import { authClient } from "../../lib/auth";
import { completeOnboarding } from "../../lib/api";
import { useAppStore } from "../../store/useAppStore";
import { useOnboardingStore } from "../../store/useOnboardingStore";

type Mode = "choose" | "email";

export default function OnboardingCreateAccountScreen() {
  const { theme } = useTheme();
  const userName = useAppStore((s) => s.user.name);
  const allyName = useAppStore((s) => s.user.allyName);
  const setUser = useAppStore((s) => s.setUser);
  const { familyMembers, challenges, dailyPingTime, magicMoment, reset } =
    useOnboardingStore();

  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const conversation = useMemo(() => {
    const convo = [
      { question: "What should I call you?", answer: userName },
      {
        question: "Tell me about your family",
        answer:
          familyMembers.length > 0
            ? familyMembers
                .map(
                  (m) =>
                    `${m.name} (${m.role}${m.age ? `, age ${m.age}` : ""})`,
                )
                .join(", ")
            : "Just me for now",
      },
      {
        question: "What falls through the cracks most?",
        answer:
          challenges.length > 0 ? challenges.join(", ") : "Nothing specific",
      },
      {
        question: "What time should I brief you every morning?",
        answer: dailyPingTime,
      },
    ];
    if (magicMoment.trim()) {
      convo.push({
        question:
          "What's the one thing this week you need to happen and the right person to know about it?",
        answer: magicMoment.trim(),
      });
    }
    return convo;
  }, [userName, familyMembers, challenges, dailyPingTime, magicMoment]);

  const finalizeOnboarding = async () => {
    setFinalizing(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await completeOnboarding({
        userName,
        allyName,
        conversation,
        dailyPingTime,
        timezone,
      });

      setUser({ dailyPingTime, timezone });
      reset();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Setup failed",
        e instanceof Error ? e.message : "Please try again.",
      );
      setFinalizing(false);
    }
  };

  const handleAppleSignUp = async () => {
    setAppleLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const { error } = await authClient.signIn.social({
        provider: "apple",
        idToken: { token: credential.identityToken! },
      });

      if (error) {
        Alert.alert(
          "Apple Sign Up failed",
          error.message ?? "Please try again.",
        );
        setAppleLoading(false);
        return;
      }

      const appleFirstName = credential.fullName?.givenName;
      if (appleFirstName && !userName) {
        setUser({ name: appleFirstName });
      }

      await finalizeOnboarding();
    } catch (e: any) {
      if (e?.code !== "ERR_REQUEST_CANCELED") {
        Alert.alert(
          "Error",
          e instanceof Error ? e.message : "Apple Sign Up failed.",
        );
      }
      setAppleLoading(false);
    }
  };

  const handleEmailSignUp = async () => {
    if (!email.trim()) {
      Alert.alert("Email required", "Please enter your email address.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Weak password", "Password must be at least 8 characters.");
      return;
    }

    setEmailLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { error } = await authClient.signUp.email({
        name: userName || "Friend",
        email: email.trim(),
        password,
      });

      if (error) {
        Alert.alert(
          "Sign up failed",
          error.message ?? "Could not create account.",
        );
        setEmailLoading(false);
        return;
      }

      await finalizeOnboarding();
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Something went wrong.",
      );
      setEmailLoading(false);
    }
  };

  if (finalizing) {
    return (
      <OnboardingShell step={6} totalSteps={6}>
        <View className="flex-1 items-center justify-center py-20">
          <ActivityIndicator
            size="large"
            color={theme.colors["--color-primary"]}
          />
          <Text className="text-foreground text-xl font-sans-semibold mt-6 mb-2">
            Setting up your family...
          </Text>
          <Text className="text-muted text-sm font-sans text-center px-8">
            Anzi is getting everything ready for you.
          </Text>
        </View>
      </OnboardingShell>
    );
  }

  if (mode === "email") {
    return (
      <OnboardingShell
        step={6}
        totalSteps={6}
        keyboardAvoiding
        footer={
          <View className="gap-2">
            <PrimaryCTA
              title={emailLoading ? "Creating account..." : "Create account"}
              onPress={handleEmailSignUp}
              icon="sparkles"
              disabled={emailLoading || !email.trim() || password.length < 8}
            />
            <PrimaryCTA
              title="Back to options"
              onPress={() => setMode("choose")}
              variant="ghost"
            />
          </View>
        }
      >
        <View className="mt-4">
          <Text className="text-foreground text-3xl font-sans-bold leading-tight mb-3">
            Almost there.
          </Text>
          <Text className="text-muted text-base font-sans leading-6 mb-8">
            Create an account so Anzi remembers everything you just shared.
          </Text>
        </View>

        <View className="gap-4">
          <TextInput
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            autoFocus
          />
          <TextInput
            label="Password"
            placeholder="At least 8 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
          />
        </View>

        <Text className="text-muted text-xs font-sans text-center leading-5 mt-6">
          By creating an account you agree to our Terms of Service and Privacy
          Policy.
        </Text>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell step={6} totalSteps={6}>
      <View className="mt-4">
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 450 }}
          className="self-start px-3 py-1 rounded-full bg-primary-soft mb-4"
        >
          <Text className="text-primary text-xs font-sans-semibold tracking-widest uppercase">
            The final step
          </Text>
        </MotiView>

        <Text className="text-foreground text-3xl font-sans-bold leading-tight mb-3">
          {userName ? `Nice to meet you, ${userName}.` : "Nice to meet you."}
        </Text>
        <Text className="text-muted text-base font-sans leading-6 mb-8">
          Create an account so Anzi can remember everything, brief you every
          morning, and keep your family in sync.
        </Text>
      </View>

      {/* What's ready to go card */}
      <MotiView
        from={{ opacity: 0, translateY: 10 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 500, delay: 150 }}
        className="rounded-2xl p-4 mb-6"
        style={{ backgroundColor: theme.colors["--color-primary"] + "14" }}
      >
        <View className="flex-row items-center mb-3">
          <View
            className="w-8 h-8 rounded-lg items-center justify-center mr-2"
            style={{
              backgroundColor: theme.colors["--color-primary"] + "26",
            }}
          >
            <Ionicons
              name="sparkles"
              size={16}
              color={theme.colors["--color-primary"]}
            />
          </View>
          <Text className="text-primary text-sm font-sans-semibold tracking-wide uppercase">
            Ready to go
          </Text>
        </View>
        <Text className="text-foreground text-sm font-sans leading-5">
          Morning briefing at{" "}
          <Text className="font-sans-semibold">
            {formatTime(dailyPingTime)}
          </Text>
          {challenges.length > 0 && (
            <>
              {" • "}
              <Text className="font-sans-semibold">
                {challenges.length} focus {challenges.length === 1 ? "area" : "areas"}
              </Text>
            </>
          )}
          {magicMoment.trim().length > 0 && (
            <>
              {" • "}
              <Text className="font-sans-semibold">
                First reminder queued
              </Text>
            </>
          )}
        </Text>
      </MotiView>

      {/* Sign up options */}
      <MotiView
        from={{ opacity: 0, translateY: 10 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 500, delay: 280 }}
        className="gap-3"
      >
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
          }
          buttonStyle={
            AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={999}
          style={{ width: "100%", height: 54 }}
          onPress={handleAppleSignUp}
        />

        {appleLoading && (
          <ActivityIndicator
            size="small"
            color={theme.colors["--color-primary"]}
          />
        )}

        <View className="flex-row items-center gap-4 my-1">
          <View className="flex-1 h-px bg-muted/20" />
          <Text className="text-muted text-xs font-sans">or</Text>
          <View className="flex-1 h-px bg-muted/20" />
        </View>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setMode("email");
          }}
          className="flex-row items-center justify-center gap-2 rounded-full py-4 px-6 bg-surface active:opacity-80"
          style={{
            borderWidth: 1,
            borderColor: theme.colors["--color-muted"] + "33",
          }}
        >
          <Ionicons
            name="mail-outline"
            size={18}
            color={theme.colors["--color-foreground"]}
          />
          <Text className="text-foreground text-base font-sans-semibold">
            Continue with email
          </Text>
        </Pressable>
      </MotiView>

      <Text className="text-muted text-xs font-sans text-center leading-5 mt-6">
        By continuing you agree to our Terms of Service and Privacy Policy.
      </Text>
    </OnboardingShell>
  );
}

function formatTime(value: string): string {
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}
