import React, { useState } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Haptics from "expo-haptics";
import { TextInput } from "../../components/ui/TextInput";
import { Button } from "../../components/ui/Button";
import { useTheme } from "../../context/ThemeContext";
import { authClient } from "../../lib/auth";
import { useAppStore } from "../../store/useAppStore";
import { completeOnboardingDynamic } from "../../lib/api";
import { ProgressBackground } from "../../components/onboarding/ProgressBackground";

export default function CreateAccountScreen() {
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  const guestProfile = useAppStore((s) => s.guestProfile);
  const onboardingGreeting = useAppStore((s) => s.onboardingGreeting);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const finalizeOnboarding = (name?: string) => {
    const profile = guestProfile ?? {
      name: name ?? "Friend",
      allyName: "Anzi",
      dailyPingTime: "9 AM",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    completeOnboarding(profile, onboardingGreeting);
    router.replace("/(tabs)");
  };

  // Sign in with Apple
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

      // Send the identity token to Better Auth
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

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const firstName = credential.fullName?.givenName ?? undefined;
      finalizeOnboarding(firstName);
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") {
        // User cancelled — no-op
      } else {
        Alert.alert(
          "Error",
          e instanceof Error ? e.message : "Apple Sign In failed.",
        );
      }
    } finally {
      setAppleLoading(false);
    }
  };

  // Email + password account creation
  const handleCreateAccount = async () => {
    if (!email.trim()) {
      Alert.alert("Email required", "Please enter your email address.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Weak password", "Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { error } = await authClient.signUp.email({
        name: guestProfile?.name ?? "",
        email: email.trim(),
        password,
      });

      if (error) {
        // If account already exists, try signing in instead
        if (error.status === 409 || error.message?.includes("already")) {
          const { error: signInError } = await authClient.signIn.email({
            email: email.trim(),
            password,
          });
          if (signInError) {
            Alert.alert("Sign in failed", signInError.message ?? "Wrong password.");
            return;
          }
        } else {
          Alert.alert("Account creation failed", error.message ?? "Please try again.");
          return;
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      finalizeOnboarding();
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <ProgressBackground progress={1} />

      <SafeAreaView edges={["top", "bottom"]} className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            keyboardShouldPersistTaps="handled"
          >
            <View className="flex-1 justify-center px-8">
              <MotiView
                from={{ opacity: 0, translateY: 20 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: "timing", duration: 600 }}
                className="items-center mb-8"
              >
                <View className="w-20 h-20 rounded-full bg-primary items-center justify-center mb-6">
                  <Text className="text-white text-3xl font-sans-bold">A</Text>
                </View>

                <Text className="text-foreground text-3xl font-sans-bold text-center mb-3">
                  Save your Anzi
                </Text>
                <Text className="text-muted text-base font-sans text-center leading-6">
                  Create an account so Anzi can remember you across all your
                  devices — forever.
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
                  buttonType={
                    AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                  }
                  buttonStyle={
                    AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={16}
                  style={{ width: "100%", height: 54 }}
                  onPress={handleAppleSignIn}
                />

                {appleLoading && (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors["--color-primary"]}
                  />
                )}

                {/* Divider */}
                <View className="flex-row items-center gap-4 my-2">
                  <View className="flex-1 h-px bg-muted/20" />
                  <Text className="text-muted text-sm font-sans">or</Text>
                  <View className="flex-1 h-px bg-muted/20" />
                </View>

                {/* Email + Password */}
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
                  placeholder="At least 8 characters"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                />

                <View className="mt-2">
                  <Button
                    title={loading ? "Creating account..." : "Create Account"}
                    onPress={handleCreateAccount}
                    disabled={loading}
                    size="lg"
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

              <MotiView
                from={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ type: "timing", duration: 400, delay: 500 }}
                className="mt-8 items-center"
              >
                <Text className="text-muted text-xs font-sans text-center leading-5">
                  By creating an account you agree to our Terms of Service and
                  Privacy Policy. Your data is encrypted and never sold.
                </Text>
              </MotiView>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
