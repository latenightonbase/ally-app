import React, { useState, useCallback } from "react";
import { View, KeyboardAvoidingView, Platform, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatePresence, MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { ProgressBackground } from "../../components/onboarding/ProgressBackground";
import { QuestionStep } from "../../components/onboarding/QuestionStep";
import { useAppStore } from "../../store/useAppStore";
import { useTheme } from "../../context/ThemeContext";

const QUESTIONS = [
  "Hey! I'm Ally. What should I call you?",
  "Now, what would you like to name your agent? This is your personal companion — make it yours.",
  "Give me the quick snapshot — what does your life look like right now?",
  "What's taking up most of your mental energy right now?",
  "When things get tough, what does that usually look like for you? And who or what helps you get through it?",
  "Last one — what would make Ally actually useful to you?",
];

const TOTAL_STEPS = QUESTIONS.length;

export default function OnboardingScreen() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const { theme } = useTheme();

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(Array(TOTAL_STEPS).fill(""));
  const [submitting, setSubmitting] = useState(false);

  const progress = (step + 1) / TOTAL_STEPS;
  const isLastStep = step === TOTAL_STEPS - 1;

  const updateAnswer = useCallback(
    (text: string) => {
      setAnswers((prev) => {
        const next = [...prev];
        next[step] = text;
        return next;
      });
    },
    [step],
  );

  const goBack = useCallback(() => {
    if (step > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setStep((s) => s - 1);
    }
  }, [step]);

  const handleNext = useCallback(async () => {
    if (!answers[step].trim()) return;

    if (!isLastStep) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setStep((s) => s + 1);
      return;
    }

    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const payload = {
      answers: {
        nameAndGreeting: answers[0].trim(),
        lifeContext: answers[2].trim(),
        currentFocus: answers[3].trim(),
        stressAndSupport: answers[4].trim(),
        allyExpectations: answers[5].trim(),
      },
    };

    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/v1/onboarding`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) throw new Error("Submission failed");

      completeOnboarding({
        name: answers[0].trim(),
        allyName: answers[1].trim() || "Ally",
        job: "",
        challenges: "",
        interests: [],
        briefingTime: "9:00 AM",
      });
      router.replace("/(tabs)");
    } catch {
      Alert.alert("Something went wrong", "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [step, isLastStep, answers, completeOnboarding]);

  return (
    <View className="flex-1 bg-background">
      <ProgressBackground progress={progress} />

      <SafeAreaView edges={["top"]} className="z-10">
        <View className="flex-row items-center pt-4 pb-2 px-4">
          {step > 0 ? (
            <Pressable onPress={goBack} hitSlop={8} className="p-1">
              <Ionicons
                name="chevron-back"
                size={24}
                color={theme.colors["--color-foreground"]}
              />
            </Pressable>
          ) : (
            <View className="w-8" />
          )}

          <View className="flex-1 flex-row justify-center items-center gap-1.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <MotiView
                key={i}
                animate={{
                  width: i <= step ? 24 : 6,
                  opacity: i <= step ? 1 : 0.3,
                }}
                transition={{ type: "timing", duration: 400 }}
                className={`h-1.5 rounded-full ${
                  i <= step ? "bg-primary" : "bg-muted/30"
                }`}
              />
            ))}
          </View>

          <View className="w-8" />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <AnimatePresence exitBeforeEnter>
          <MotiView
            key={`step-${step}`}
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, translateY: -8 }}
            transition={{ type: "timing", duration: 300 }}
            className="flex-1"
          >
            <QuestionStep
              stepIndex={step}
              title={QUESTIONS[step]}
              type="multiline"
              placeholder="Type your answer..."
              value={answers[step]}
              onChangeText={updateAnswer}
              canContinue={answers[step].trim().length > 0 && !submitting}
              onNext={handleNext}
              buttonTitle={isLastStep ? "Submit" : "Continue"}
            />
          </MotiView>
        </AnimatePresence>
      </KeyboardAvoidingView>
    </View>
  );
}
