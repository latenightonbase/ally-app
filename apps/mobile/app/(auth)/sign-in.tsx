import React, { useState } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { router } from "expo-router";
import { TextInput } from "../../components/ui/TextInput";
import { Button } from "../../components/ui/Button";
import { useTheme } from "../../context/ThemeContext";
import { authClient } from "../../lib/auth";

export default function SignInScreen() {
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
          <View className="flex-1 justify-center px-8">
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
                <Button
                  title={loading ? "Signing in..." : "Sign In"}
                  onPress={handleSignIn}
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
              className="mt-8 items-center"
            >
              <Pressable onPress={() => router.push("/(auth)/sign-up")}>
                <Text className="text-muted text-base font-sans">
                  Don't have an account?{" "}
                  <Text className="text-primary font-sans-semibold">
                    Sign Up
                  </Text>
                </Text>
              </Pressable>
            </MotiView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
