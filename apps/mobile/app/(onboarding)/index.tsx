import React, { useState, useCallback } from "react";
import {
  View,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatePresence, MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { ProgressBackground } from "../../components/onboarding/ProgressBackground";
import { QuestionStep } from "../../components/onboarding/QuestionStep";
import { useAppStore } from "../../store/useAppStore";
import { useTheme } from "../../context/ThemeContext";
import { registerForPushNotificationsAsync } from "../../lib/useNotifications";
import {
  completeOnboardingDynamic,
  type OnboardingQA,
  type DynamicOnboardingQuestion,
} from "../../lib/api";

// Screen 1: Intro — name input
const SCREEN_INTRO: DynamicOnboardingQuestion = {
  title: "Hey! I'm Anzi. What should I call you?",
  type: "text",
  placeholder: "Your name",
};

// Screen 2: Mental Load — single choice, auto-advance
const SCREEN_MENTAL_LOAD: DynamicOnboardingQuestion = {
  title: "What's been taking up the most space in your head lately?",
  type: "choice",
  choices: [
    { label: "Work stuff", value: "work" },
    { label: "Relationship things", value: "relationships" },
    { label: "Health & body", value: "health" },
    { label: "Money & finances", value: "money" },
    { label: "Family", value: "family" },
    { label: "Just life in general", value: "life" },
  ],
};

// Screen 3: Emotional Check-in — single choice, auto-advance
const SCREEN_EMOTIONAL: DynamicOnboardingQuestion = {
  title: "And honestly — how are you holding up?",
  type: "choice",
  choices: [
    { label: "Pretty good actually", value: "good" },
    { label: "Hanging in there", value: "okay" },
    { label: "Kinda struggling", value: "struggling" },
    { label: "Honestly not great", value: "not_great" },
  ],
};

// Screen 4: Desired Relief — single choice, auto-advance
const SCREEN_RELIEF: DynamicOnboardingQuestion = {
  title: "If I could help with one thing, what would matter most?",
  type: "choice",
  choices: [
    { label: "Someone to vent to", value: "vent" },
    { label: "Help me stay on top of things", value: "organize" },
    { label: "Remember the stuff I forget", value: "remember" },
    { label: "Just check in on me", value: "check_in" },
  ],
};

// Screen 5: Promise — no input, just a statement + continue button
const SCREEN_PROMISE: DynamicOnboardingQuestion = {
  title: "I won't forget.",
  subtitle:
    "Not your appointments. Not your goals. Not the things people say that matter to you.\n\nThat's my whole job.",
  type: "text",
  placeholder: "",
};

// Screen 6: Time picker
const TIME_PICKER_QUESTION: DynamicOnboardingQuestion = {
  title: "When should I ping you every day?",
  subtitle:
    "I'll send you a little check-in at this time. You can always change it later!",
  type: "chips",
  options: ["6 AM", "9 AM", "12 PM", "3 PM", "6 PM", "9 PM"],
};

// Screen 7: Notification permission
const SCREEN_NOTIFICATIONS: DynamicOnboardingQuestion = {
  title: "Stay in the loop 🔔",
  subtitle:
    "I'll send you reminders, check-ins, and your daily briefing as push notifications.\n\nYou can change this anytime in Settings.",
  type: "text",
  placeholder: "",
};

type ScreenPhase =
  | "intro"
  | "mental-load"
  | "emotional"
  | "relief"
  | "promise"
  | "time-picker"
  | "notifications";

// Phases that auto-advance when a choice is selected
const AUTO_ADVANCE_PHASES: ScreenPhase[] = [
  "mental-load",
  "emotional",
  "relief",
];

interface StepData {
  question: DynamicOnboardingQuestion;
  answer: string;
  selectedOptions: string[];
  selectedChoice: string;
  phase: ScreenPhase;
}

const INITIAL_STEPS: StepData[] = [
  { question: SCREEN_INTRO, answer: "", selectedOptions: [], selectedChoice: "", phase: "intro" },
  { question: SCREEN_MENTAL_LOAD, answer: "", selectedOptions: [], selectedChoice: "", phase: "mental-load" },
  { question: SCREEN_EMOTIONAL, answer: "", selectedOptions: [], selectedChoice: "", phase: "emotional" },
  { question: SCREEN_RELIEF, answer: "", selectedOptions: [], selectedChoice: "", phase: "relief" },
  { question: SCREEN_PROMISE, answer: "", selectedOptions: [], selectedChoice: "", phase: "promise" },
  { question: TIME_PICKER_QUESTION, answer: "", selectedOptions: [], selectedChoice: "", phase: "time-picker" },
  { question: SCREEN_NOTIFICATIONS, answer: "", selectedOptions: [], selectedChoice: "", phase: "notifications" },
];

export default function OnboardingScreen() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const { theme } = useTheme();

  const [steps, setSteps] = useState<StepData[]>(INITIAL_STEPS);
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const totalSteps = steps.length;
  const progress = (currentStep + 1) / totalSteps;
  const currentStepData = steps[currentStep];
  const isLastStep = currentStepData?.phase === "notifications";

  const canContinue = (() => {
    if (!currentStepData) return false;
    if (submitting) return false;
    switch (currentStepData.phase) {
      case "intro":
        return currentStepData.answer.trim().length > 0;
      case "mental-load":
      case "emotional":
      case "relief":
        return currentStepData.selectedChoice.length > 0;
      case "promise":
        return true;
      case "time-picker":
        return currentStepData.selectedOptions.length > 0;
      case "notifications":
        return true;
      default:
        return false;
    }
  })();

  const updateAnswer = useCallback(
    (text: string) => {
      setSteps((prev) => {
        const next = [...prev];
        next[currentStep] = { ...next[currentStep], answer: text };
        return next;
      });
    },
    [currentStep],
  );

  const toggleOption = useCallback(
    (option: string) => {
      setSteps((prev) => {
        const next = [...prev];
        const step = { ...next[currentStep] };
        // Time picker: only allow one selection
        step.selectedOptions = [option];
        next[currentStep] = step;
        return next;
      });
    },
    [currentStep],
  );

  const selectChoice = useCallback(
    (value: string) => {
      setSteps((prev) => {
        const next = [...prev];
        next[currentStep] = { ...next[currentStep], selectedChoice: value };
        return next;
      });

      // Auto-advance for choice screens after a brief delay
      if (
        currentStepData &&
        AUTO_ADVANCE_PHASES.includes(currentStepData.phase)
      ) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTimeout(() => {
          setCurrentStep((s) => s + 1);
        }, 350);
      }
    },
    [currentStep, currentStepData],
  );

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  // Build the conversation history from onboarding answers for the API
  const buildConversation = useCallback((): OnboardingQA[] => {
    const convo: OnboardingQA[] = [];
    for (const s of steps) {
      if (s.phase === "time-picker" || s.phase === "promise") continue;

      let answer = s.answer;
      if (s.question.type === "choice") {
        const choice = s.question.choices?.find(
          (c) => c.value === s.selectedChoice,
        );
        answer = choice?.label ?? s.selectedChoice;
      }

      if (answer.trim()) {
        convo.push({ question: s.question.title, answer: answer.trim() });
      }
    }
    return convo;
  }, [steps]);

  const handleNext = useCallback(async () => {
    if (!canContinue) return;

    // If this is the notifications step → request permission then submit everything
    if (isLastStep) {
      setSubmitting(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Request push notification permission (non-blocking — user can skip)
      try {
        await registerForPushNotificationsAsync();
      } catch (e) {
        console.warn("[onboarding] Notification permission request failed:", e);
      }

      try {
        const userName = steps[0].answer.trim();
        const conversation = buildConversation();
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        // Time picker is now at index 5 (0-indexed)
        const dailyPingTime =
          steps[5].selectedOptions[0] || "9 AM";

        const { greeting } = await completeOnboardingDynamic({
          userName,
          allyName: "Anzi",
          conversation,
          dailyPingTime,
          timezone,
        });

        completeOnboarding(
          {
            name: userName,
            allyName: "Anzi",
            dailyPingTime,
            timezone,
          },
          greeting,
        );
        router.replace("/(tabs)");
      } catch {
        Alert.alert("Something went wrong", "Please try again.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentStep((s) => s + 1);
  }, [
    canContinue,
    isLastStep,
    steps,
    currentStep,
    buildConversation,
    completeOnboarding,
  ]);

  if (!currentStepData) return null;

  // Determine button title
  const getButtonTitle = () => {
    if (submitting) return "Setting things up...";
    if (isLastStep) return "Let's go! 🚀";
    if (currentStepData.phase === "promise") return "I'm ready";
    if (currentStepData.phase === "time-picker") return "Continue";
    return "Continue";
  };

  // Hide button for auto-advance choice screens
  const showButton = !AUTO_ADVANCE_PHASES.includes(currentStepData.phase);

  return (
    <View className="flex-1 bg-background">
      <ProgressBackground progress={progress} />

      <SafeAreaView edges={["top"]} className="z-10">
        <View className="flex-row items-center pt-4 pb-2 px-4">
          {currentStep > 0 ? (
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
            {Array.from({ length: totalSteps }).map((_, i) => (
              <MotiView
                key={i}
                animate={{
                  width: i <= currentStep ? 24 : 6,
                  opacity: i <= currentStep ? 1 : 0.3,
                }}
                transition={{ type: "timing", duration: 400 }}
                className={`h-1.5 rounded-full ${
                  i <= currentStep ? "bg-primary" : "bg-muted/30"
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
            key={`step-${currentStep}`}
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, translateY: -8 }}
            transition={{ type: "timing", duration: 300 }}
            className="flex-1"
          >
            <QuestionStep
              stepIndex={currentStep}
              title={currentStepData.question.title}
              subtitle={currentStepData.question.subtitle}
              type={
                currentStepData.phase === "promise" ||
                currentStepData.phase === "notifications"
                  ? "promise"
                  : currentStepData.question.type
              }
              placeholder={
                currentStepData.question.placeholder ?? "Type your answer..."
              }
              value={currentStepData.answer}
              onChangeText={updateAnswer}
              options={currentStepData.question.options}
              selectedOptions={currentStepData.selectedOptions}
              onToggleOption={toggleOption}
              choices={currentStepData.question.choices}
              selectedChoice={currentStepData.selectedChoice}
              onSelectChoice={selectChoice}
              canContinue={canContinue}
              onNext={handleNext}
              buttonTitle={getButtonTitle()}
              showButton={showButton}
            />
          </MotiView>
        </AnimatePresence>
      </KeyboardAvoidingView>
    </View>
  );
}
