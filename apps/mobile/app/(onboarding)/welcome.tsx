import React from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Button } from "../../components/ui/Button";
import { DitheringShader } from "../../components/ui/dithering-shader";
import { useTheme } from "../../context/ThemeContext";

export default function WelcomeScreen() {
  const { theme } = useTheme();

  const handleGetStarted = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/(onboarding)/questions");
  };

  const handleLogin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(auth)/sign-in");
  };

  return (
    <View className="flex-1 bg-background">
      {/* Animated background shader */}
      <View className="absolute inset-0 overflow-hidden" pointerEvents="none">
        <DitheringShader
          shape="wave"
          type="8x8"
          colorBack={theme.preview.background}
          colorFront={theme.preview.primary}
          pxSize={3}
          speed={0.4}
          revealProgress={1}
          style={{ flex: 1, opacity: 0.35 }}
        />
      </View>

      <SafeAreaView edges={["top", "bottom"]} className="flex-1">
        {/* Top spacer */}
        <View className="flex-1 items-center justify-center px-8">
          <MotiView
            from={{ opacity: 0, translateY: 24 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 700 }}
            className="items-center"
          >
            {/* Avatar */}
            <View className="w-24 h-24 rounded-full bg-primary items-center justify-center mb-8 shadow-lg">
              <Text className="text-white text-4xl font-sans-bold">A</Text>
            </View>

            <Text className="text-foreground text-4xl font-sans-bold text-center mb-3">
              Meet Anzi
            </Text>

            <Text className="text-muted text-lg font-sans text-center leading-7 mb-2">
              Your personal companion who actually{" "}
              <Text className="text-foreground font-sans-semibold">
                remembers
              </Text>{" "}
              what matters to you.
            </Text>
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 500, delay: 400 }}
            className="w-full mt-12 gap-4"
          >
            {/* Feature pills */}
            <View className="flex-row flex-wrap gap-2 justify-center mb-6">
              {[
                "📅 Daily briefings",
                "🧠 Smart memory",
                "❤️ Emotional check-ins",
                "🔔 Gentle reminders",
              ].map((feat) => (
                <View
                  key={feat}
                  className="bg-surface border border-primary/20 rounded-full px-4 py-1.5"
                >
                  <Text className="text-foreground text-sm font-sans">
                    {feat}
                  </Text>
                </View>
              ))}
            </View>

            <Button
              title="Get Started — It's Free"
              onPress={handleGetStarted}
              size="lg"
            />

            <Pressable
              onPress={handleLogin}
              className="items-center py-3"
              hitSlop={8}
            >
              <Text className="text-muted text-base font-sans">
                Already have an account?{" "}
                <Text className="text-primary font-sans-semibold">Log in</Text>
              </Text>
            </Pressable>
          </MotiView>
        </View>
      </SafeAreaView>
    </View>
  );
}
