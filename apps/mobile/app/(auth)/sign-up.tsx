import React, { useState } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { createFamily } from "../../lib/api";

export default function SignUpScreen() {
  const { theme } = useTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const setUser = useAppStore((s) => s.setUser);

  /** After auth succeeds, create a default family for the user */
  const setupFamily = async (userName: string) => {
    try {
      await createFamily({
        name: `${userName}'s Family`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    } catch {
      // Non-fatal — they can create a family later
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
        idToken: {
          token: credential.identityToken!,
        },
      });

      if (error) {
        Alert.alert("Apple Sign In failed", error.message ?? "Please try again.");
        return;
      }

      const firstName = credential.fullName?.givenName ?? "Friend";
      setUser({ name: firstName });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await setupFamily(firstName);
      router.replace("/(tabs)");
    } catch (e: any) {
      if (e?.code !== "ERR_REQUEST_CANCELED") {
        Alert.alert("Error", e instanceof Error ? e.message : "Apple Sign In failed.");
      }
    } finally {
      setAppleLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter your name.");
      return;
    }
    if (!email.trim()) {
      Alert.alert("Email required", "Please enter your email address.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Weak password", "Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Password mismatch", "Passwords do not match.");
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { error } = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
      });

      if (error) {
        Alert.alert(
          "Sign up failed",
          error.message ?? "Could not create account.",
        );
        return;
      }

      setUser({ name: name.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await setupFamily(name.trim());
      router.replace("/(tabs)");
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
      <SafeAreaView edges={["top", "bottom"]} className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            keyboardShouldPersistTaps="handled"
            className="px-8"
          >
            <MotiView
              from={{ opacity: 0, translateY: 16 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 600 }}
              className="items-center mb-10"
            >
              <View className="w-20 h-20 rounded-full bg-primary items-center justify-center mb-6">
                <Text className="text-white text-3xl font-sans-bold">A</Text>
              </View>
              <Text className="text-foreground text-3xl font-sans-bold text-center mb-2">
                Get Started
              </Text>
              <Text className="text-muted text-base font-sans text-center leading-6">
                Your family's AI organizer that makes sure{"\n"}nothing falls through the cracks.
              </Text>
            </MotiView>

            <MotiView
              from={{ opacity: 0, translateY: 12 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 500, delay: 200 }}
              className="gap-4"
            >
              {/* Sign up with Apple */}
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={16}
                style={{ width: "100%", height: 54 }}
                onPress={handleAppleSignUp}
              />

              {appleLoading && (
                <ActivityIndicator size="small" color={theme.colors["--color-primary"]} />
              )}

              {/* Divider */}
              <View className="flex-row items-center gap-4 my-1">
                <View className="flex-1 h-px bg-muted/20" />
                <Text className="text-muted text-sm font-sans">or</Text>
                <View className="flex-1 h-px bg-muted/20" />
              </View>

              <TextInput
                label="Your Name"
                placeholder="What should Anzi call you?"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoCorrect={false}
                autoComplete="name"
              />
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
              <TextInput
                label="Confirm Password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
              />

              <View className="mt-4">
                <Button
                  title={loading ? "Creating account..." : "Create Account"}
                  onPress={handleSignUp}
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
              transition={{ type: "timing", duration: 400, delay: 400 }}
              className="mt-8 mb-8 items-center gap-3"
            >
              <Pressable onPress={() => router.push("/(auth)/sign-in")}>
                <Text className="text-muted text-base font-sans">
                  Already have an account?{" "}
                  <Text className="text-primary font-sans-semibold">
                    Sign In
                  </Text>
                </Text>
              </Pressable>
              <Text className="text-muted text-xs font-sans text-center leading-5 mt-2">
                By creating an account you agree to our Terms of Service and
                Privacy Policy.
              </Text>
            </MotiView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
