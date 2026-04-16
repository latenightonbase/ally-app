import React, { useState } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput as RNTextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { router } from "expo-router";
import { Button } from "../../components/ui/Button";
import { useTheme } from "../../context/ThemeContext";
import { useAppStore } from "../../store/useAppStore";
import { useOnboardingStore } from "../../store/useOnboardingStore";
import { completeOnboarding } from "../../lib/api";

export default function OnboardingMagicMomentScreen() {
  const { theme } = useTheme();
  const userName = useAppStore((s) => s.user.name);
  const allyName = useAppStore((s) => s.user.allyName);
  const { familyMembers, challenges, dailyPingTime, reset } =
    useOnboardingStore();
  const setUser = useAppStore((s) => s.setUser);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleComplete = async () => {
    setLoading(true);

    const conversation = [
      {
        question: "What should I call you?",
        answer: userName,
      },
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
        answer: challenges.length > 0 ? challenges.join(", ") : "Nothing specific",
      },
      {
        question: "What time should I brief you every morning?",
        answer: dailyPingTime,
      },
    ];

    if (text.trim()) {
      conversation.push({
        question:
          "What's the one thing this week you need to happen and the right person to know about it?",
        answer: text.trim(),
      });
    }

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const result = await completeOnboarding({
        userName,
        allyName,
        conversation,
        dailyPingTime,
        timezone,
      });

      setUser({ dailyPingTime, timezone });
      reset();
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert(
        "Setup failed",
        e instanceof Error ? e.message : "Please try again.",
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
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            className="px-8 pt-12"
          >
            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 500 }}
            >
              <Text className="text-foreground text-3xl font-sans-bold mb-3">
                One last thing
              </Text>
              <Text className="text-muted text-base font-sans leading-6 mb-8">
                Tell me one thing you need to happen this week — and I'll make
                sure the right person knows about it.
              </Text>

              <View className="bg-surface rounded-2xl p-4 border border-border/30">
                <RNTextInput
                  value={text}
                  onChangeText={setText}
                  placeholder={`"Jake has a dentist appointment Thursday at 3, remind Mike Wednesday night"`}
                  placeholderTextColor={theme.colors["--color-muted"]}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  className="text-foreground text-base font-sans"
                  style={{
                    color: theme.colors["--color-foreground"],
                    minHeight: 120,
                  }}
                />
              </View>

              <View className="bg-primary/10 rounded-2xl p-4 mt-4 flex-row">
                <Text className="text-primary text-2xl mr-3">✨</Text>
                <Text className="text-primary text-sm font-sans flex-1 leading-5">
                  This is where the magic starts. Anzi will add it to the
                  calendar, set reminders, and notify the right people —
                  automatically.
                </Text>
              </View>
            </MotiView>

            <View className="mt-auto pb-8">
              {loading ? (
                <View className="items-center py-4">
                  <ActivityIndicator
                    size="large"
                    color={theme.colors["--color-primary"]}
                  />
                  <Text className="text-muted text-sm font-sans mt-3">
                    Setting up your family...
                  </Text>
                </View>
              ) : (
                <>
                  <Button
                    title="Let's go!"
                    onPress={handleComplete}
                    size="lg"
                  />
                  {!text.trim() && (
                    <Button
                      title="Skip — I'll tell you later"
                      onPress={handleComplete}
                      variant="ghost"
                      size="md"
                      className="mt-2"
                    />
                  )}
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
