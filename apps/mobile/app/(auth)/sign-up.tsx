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
import { TextInput } from "../../components/ui/TextInput";
import { Button } from "../../components/ui/Button";
import { useTheme } from "../../context/ThemeContext";
import { authClient } from "../../lib/auth";

export default function SignUpScreen() {
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing fields", "Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Password mismatch", "Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      Alert.alert(
        "Weak password",
        "Password must be at least 8 characters long.",
      );
      return;
    }

    setLoading(true);
    try {
      const { error } = await authClient.signUp.email({
        name: "",
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
                Create Account
              </Text>
              <Text className="text-muted text-base font-sans text-center">
                Join Anzi — the friend who never forgets
              </Text>
            </MotiView>

            <MotiView
              from={{ opacity: 0, translateY: 12 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 500, delay: 200 }}
              className="gap-4"
            >
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
              className="mt-8 mb-8 items-center"
            >
              <Pressable onPress={() => router.back()}>
                <Text className="text-muted text-base font-sans">
                  Already have an account?{" "}
                  <Text className="text-primary font-sans-semibold">
                    Sign In
                  </Text>
                </Text>
              </Pressable>
            </MotiView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
