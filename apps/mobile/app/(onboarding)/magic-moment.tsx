import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView, AnimatePresence } from "moti";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Button } from "../../components/ui/Button";
import { ProgressBackground } from "../../components/onboarding/ProgressBackground";
import { useTheme } from "../../context/ThemeContext";

// Warm, personalized Anzi responses to the memory moment
const ANZI_RESPONSES = [
  "I've got it. I won't let that slip away. 🤍",
  "Noted. That one stays with me, always.",
  "Done. I'll remind you when it matters most.",
  "That's yours to keep. I'll hold onto it.",
  "Saved. You won't have to carry that alone.",
];

export default function MagicMomentScreen() {
  const { theme } = useTheme();
  const [memory, setMemory] = useState("");
  const [anziReply, setAnziReply] = useState<string | null>(null);
  const [phase, setPhase] = useState<"input" | "replied">("input");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 500);
    return () => clearTimeout(t);
  }, []);

  const canSubmit = memory.trim().length > 0 && phase === "input";

  const handleSubmit = async () => {
    if (!canSubmit) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLoading(true);

    // Schedule a local reminder notification for this memory
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === "granted") {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Anzi remembers 🤍",
            body: memory.trim(),
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 60 * 60 * 24, // remind tomorrow
            repeats: false,
          },
        });
      }
    } catch {
      // non-fatal
    }

    const reply =
      ANZI_RESPONSES[Math.floor(Math.random() * ANZI_RESPONSES.length)];
    setAnziReply(reply);
    setPhase("replied");
    setLoading(false);
  };

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Paywalls temporarily disabled — skip straight to account creation
    // router.push("/(onboarding)/rating");
    router.push("/(onboarding)/create-account");
  };

  return (
    <View className="flex-1 bg-background">
      <ProgressBackground progress={0.7} />

      <SafeAreaView edges={["top"]} className="z-10">
        <View className="pt-6 pb-2 px-6">
          <View className="w-8 h-8 rounded-full bg-primary items-center justify-center">
            <Text className="text-white text-base font-sans-bold">A</Text>
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 justify-center px-8">
          <AnimatePresence exitBeforeEnter>
            {phase === "input" ? (
              <MotiView
                key="input-phase"
                from={{ opacity: 0, translateY: 14 }}
                animate={{ opacity: 1, translateY: 0 }}
                exit={{ opacity: 0, translateY: -10 }}
                transition={{ type: "timing", duration: 500 }}
              >
                <Text className="text-foreground text-2xl font-sans-bold mb-2 leading-9">
                  Before we go — tell me one thing you don't want to forget.
                </Text>
                <Text className="text-muted text-base font-sans mb-8 leading-6">
                  A person, a goal, a date, a feeling. Anything that matters to
                  you right now.
                </Text>

                <TextInput
                  ref={inputRef}
                  placeholder="e.g. Call mom this weekend"
                  placeholderTextColor={theme.colors["--color-muted"]}
                  value={memory}
                  onChangeText={setMemory}
                  multiline
                  numberOfLines={3}
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={handleSubmit}
                  selectionColor={theme.preview.primary}
                  cursorColor={theme.preview.primary}
                  style={{
                    fontSize: 20,
                    fontWeight: "600",
                    color: theme.preview.primary,
                    backgroundColor: "transparent",
                    borderWidth: 0,
                    paddingVertical: 8,
                    paddingHorizontal: 0,
                    minHeight: 80,
                    textAlignVertical: "top",
                  }}
                />

                <MotiView
                  animate={{ opacity: canSubmit ? 1 : 0.4 }}
                  transition={{ type: "timing", duration: 300 }}
                  className="mt-10"
                >
                  <Button
                    title={loading ? "Saving..." : "Tell Anzi"}
                    onPress={handleSubmit}
                    disabled={!canSubmit || loading}
                    size="lg"
                  />
                </MotiView>
              </MotiView>
            ) : (
              <MotiView
                key="replied-phase"
                from={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "timing", duration: 600 }}
              >
                {/* Anzi's warm response bubble */}
                <View className="bg-surface border border-primary/20 rounded-3xl p-6 mb-8">
                  <View className="flex-row items-center gap-3 mb-3">
                    <View className="w-8 h-8 rounded-full bg-primary items-center justify-center">
                      <Text className="text-white text-sm font-sans-bold">
                        A
                      </Text>
                    </View>
                    <Text className="text-muted text-sm font-sans">Anzi</Text>
                  </View>
                  <Text className="text-foreground text-xl font-sans-semibold leading-8">
                    {anziReply}
                  </Text>
                </View>

                <View className="bg-primary/10 rounded-2xl p-4 mb-8">
                  <Text className="text-primary text-sm font-sans-semibold mb-1">
                    🔔 Reminder set
                  </Text>
                  <Text className="text-foreground text-base font-sans">
                    "{memory.trim()}"
                  </Text>
                </View>

                <Button title="Continue" onPress={handleContinue} size="lg" />
              </MotiView>
            )}
          </AnimatePresence>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
