import React, { useState } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { Easing } from "react-native-reanimated";
import { router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Haptics from "expo-haptics";
import { TextInput } from "../../components/ui/TextInput";
import { PrimaryCTA } from "../../components/onboarding/PrimaryCTA";
import { useTheme } from "../../context/ThemeContext";
import { authClient } from "../../lib/auth";
import { useAppStore, clearPersistedStorage } from "../../store/useAppStore";
import { useFamilyStore, clearFamilyPersistedStorage } from "../../store/useFamilyStore";
import { useOnboardingStore } from "../../store/useOnboardingStore";

async function clearStaleStores() {
  useAppStore.getState().reset();
  useFamilyStore.getState().reset();
  await Promise.all([clearPersistedStorage(), clearFamilyPersistedStorage()]);
}

export default function SignInScreen() {
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const resetOnboarding = useOnboardingStore((s) => s.reset);

  const handleGetStarted = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    resetOnboarding();
    useAppStore.getState().setUser({ name: "" });
    router.push("/(onboarding)");
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing fields", "Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await authClient.signIn.email({
        email: email.trim(),
        password,
      });

      if (error) {
        Alert.alert("Sign in failed", error.message ?? "Invalid credentials.");
        return;
      }

      await clearStaleStores();
      router.replace("/");
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
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
        idToken: {
          token: credential.identityToken!,
        },
      });

      if (error) {
        Alert.alert("Apple Sign In failed", error.message ?? "Please try again.");
        return;
      }

      await clearStaleStores();
      router.replace("/");
    } catch (e: any) {
      if (e?.code !== "ERR_REQUEST_CANCELED") {
        Alert.alert("Error", e instanceof Error ? e.message : "Apple Sign In failed.");
      }
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top", "bottom"]} className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <View className="flex-1 justify-center px-8">
            <MotiView
              from={{ opacity: 0, translateY: 16 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 600 }}
              className="items-center mb-10"
            >
              <View className="relative w-24 h-24 items-center justify-center mb-6">
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
              <Text className="text-foreground text-3xl font-sans-bold text-center mb-2">
                Welcome back
              </Text>
              <Text className="text-muted text-base font-sans text-center">
                Sign in to continue to Anzi
              </Text>
            </MotiView>

            <MotiView
              from={{ opacity: 0, translateY: 12 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 500, delay: 200 }}
              className="gap-4"
            >
              {/* Sign in with Apple */}
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={18}
                style={{ width: "100%", height: 54 }}
                onPress={handleAppleSignIn}
              />

              {appleLoading && (
                <ActivityIndicator size="small" color={theme.colors["--color-primary"]} />
              )}

              {/* Divider */}
              <View className="flex-row items-center gap-4">
                <View className="flex-1 h-px bg-muted/20" />
                <Text className="text-muted text-sm font-sans">or</Text>
                <View className="flex-1 h-px bg-muted/20" />
              </View>

              <TextInput
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
              />
              <TextInput
                label="Password"
                placeholder="Your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password"
              />

              <View className="mt-4">
                <PrimaryCTA
                  title={loading ? "Signing in..." : "Sign In"}
                  onPress={handleSignIn}
                  disabled={loading}
                />
              </View>

              {loading && (
                <ActivityIndicator
                  size="small"
                  color={theme.colors["--color-primary"]}
                  className="mt-2"
                />
              )}
            </MotiView>

            {/* New-here CTA */}
            <MotiView
              from={{ opacity: 0, translateY: 8 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 500, delay: 380 }}
              className="mt-10"
            >
              <View className="flex-row items-center gap-4 mb-5">
                <View className="flex-1 h-px bg-muted/20" />
                <Text className="text-muted text-xs font-sans-semibold tracking-widest uppercase">
                  New to Anzi?
                </Text>
                <View className="flex-1 h-px bg-muted/20" />
              </View>

              <PrimaryCTA
                title="Get Started"
                onPress={handleGetStarted}
                variant="soft"
              />

              <Text className="text-muted text-xs font-sans text-center leading-5 mt-3">
                1-minute setup. No credit card.
              </Text>
            </MotiView>

          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
