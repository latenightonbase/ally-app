import React, { useState, useCallback } from "react";
import { View, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatePresence, MotiView } from "moti";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { ProgressBackground } from "../../components/onboarding/ProgressBackground";
import { WelcomeStep } from "../../components/onboarding/WelcomeStep";
import { QuestionStep } from "../../components/onboarding/QuestionStep";
import { CompletionStep } from "../../components/onboarding/CompletionStep";
import { useAppStore } from "../../store/useAppStore";

const TOTAL_STEPS = 8; // 0=welcome, 1=name-the-bot, 2-6=questions, 7=completion

const INTEREST_OPTIONS = [
  "Reading",
  "Cooking",
  "Fitness",
  "Travel",
  "Music",
  "Film",
  "Tech",
  "Gardening",
  "Art",
  "Pets",
  "Sports",
  "Gaming",
];

const TIME_CHOICES = [
  { label: "🌅  Early bird — 7:00 AM", value: "7:00 AM" },
  { label: "☀️  Morning — 9:00 AM", value: "9:00 AM" },
  { label: "🌤️  Midday — 12:00 PM", value: "12:00 PM" },
  { label: "🌇  Afternoon — 3:00 PM", value: "3:00 PM" },
];

export default function OnboardingScreen() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const [step, setStep] = useState(0);
  const [allyName, setAllyName] = useState("");
  const [name, setName] = useState("");
  const [job, setJob] = useState("");
  const [challenges, setChallenges] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [briefingTime, setBriefingTime] = useState("");

  const progress = step / (TOTAL_STEPS - 1);

  const goNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }, []);

  const toggleInterest = useCallback((option: string) => {
    Haptics.selectionAsync();
    setInterests((prev) =>
      prev.includes(option)
        ? prev.filter((i) => i !== option)
        : [...prev, option]
    );
  }, []);

  const handleFinish = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    completeOnboarding({
      name: name.trim(),
      allyName: allyName.trim() || "Ally",
      job: job.trim(),
      challenges: challenges.trim(),
      interests,
      briefingTime: briefingTime || "9:00 AM",
    });
    router.replace("/(tabs)");
  }, [allyName, name, job, challenges, interests, briefingTime, completeOnboarding]);

  const renderStep = () => {
    switch (step) {
      case 0:
        return <WelcomeStep onNext={goNext} />;
      case 1:
        return (
          <QuestionStep
            stepIndex={1}
            title="First things first — what would you like to call me?"
            subtitle="Give me a name that feels right. I'll go by whatever you choose."
            type="text"
            placeholder="e.g., Ally, Buddy, Nova..."
            value={allyName}
            onChangeText={setAllyName}
            canContinue={allyName.trim().length > 0}
            onNext={goNext}
          />
        );
      case 2:
        return (
          <QuestionStep
            stepIndex={2}
            title={`Great — I'm ${allyName.trim() || "your companion"} now! What should I call you?`}
            subtitle="I like knowing names — it makes things personal."
            type="text"
            placeholder="Your name"
            value={name}
            onChangeText={setName}
            canContinue={name.trim().length > 0}
            onNext={goNext}
          />
        );
      case 3:
        return (
          <QuestionStep
            stepIndex={3}
            title="What do you do for work?"
            subtitle="Or what keeps you busy? I'm curious about your world."
            type="text"
            placeholder="e.g., Teacher, Truck driver, Retired..."
            value={job}
            onChangeText={setJob}
            canContinue={job.trim().length > 0}
            onNext={goNext}
          />
        );
      case 4:
        return (
          <QuestionStep
            stepIndex={4}
            title="What's been on your mind lately?"
            subtitle="No wrong answers. I'm here to listen."
            type="multiline"
            placeholder="Whatever comes to mind..."
            value={challenges}
            onChangeText={setChallenges}
            canContinue={challenges.trim().length > 0}
            onNext={goNext}
          />
        );
      case 5:
        return (
          <QuestionStep
            stepIndex={5}
            title="What are you into?"
            subtitle="Pick as many as you like — helps me know what matters to you."
            type="chips"
            options={INTEREST_OPTIONS}
            selectedOptions={interests}
            onToggleOption={toggleInterest}
            canContinue={interests.length > 0}
            onNext={goNext}
          />
        );
      case 6:
        return (
          <QuestionStep
            stepIndex={6}
            title="When should I check in?"
            subtitle="I'll send you a personalized briefing every day."
            type="choice"
            choices={TIME_CHOICES}
            selectedChoice={briefingTime}
            onSelectChoice={(v) => {
              Haptics.selectionAsync();
              setBriefingTime(v);
            }}
            canContinue={briefingTime.length > 0}
            onNext={goNext}
          />
        );
      case 7:
        return <CompletionStep name={name} allyName={allyName.trim() || "Ally"} onFinish={handleFinish} />;
      default:
        return null;
    }
  };

  return (
    <View className="flex-1 bg-background">
      <ProgressBackground progress={progress} />

      {/* Step dots indicator */}
      <SafeAreaView edges={["top"]} className="z-10">
        <View className="flex-row justify-center items-center pt-4 pb-2 gap-1.5">
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
            {renderStep()}
          </MotiView>
        </AnimatePresence>
      </KeyboardAvoidingView>
    </View>
  );
}
