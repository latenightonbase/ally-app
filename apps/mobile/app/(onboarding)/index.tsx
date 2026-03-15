import React, { useState, useCallback, useRef } from "react";
import {
  View,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
  ActivityIndicator,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatePresence, MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { ProgressBackground } from "../../components/onboarding/ProgressBackground";
import { QuestionStep } from "../../components/onboarding/QuestionStep";
import { useAppStore } from "../../store/useAppStore";
import { useTheme } from "../../context/ThemeContext";
import {
  getOnboardingFollowups,
  completeOnboardingDynamic,
  type OnboardingQA,
  type DynamicOnboardingQuestion,
} from "../../lib/api";

// The fixed opening questions
const FIXED_QUESTIONS: DynamicOnboardingQuestion[] = [
  {
    title: "Hey! I'm Ally. What should I call you?",
    type: "text",
    placeholder: "Your name",
  },
  {
    title: "Now, what would you like to name your agent? This is your personal companion — make it yours.",
    subtitle: "You can always call it Ally, or pick something unique!",
    type: "text",
    placeholder: "e.g. Ally, Atlas, Nova...",
  },
  {
    title: "When's your birthday?",
    subtitle: "So I never forget — and can do the math when you mention your age 😄",
    type: "text",
    placeholder: "e.g. March 15, 2001",
    optional: true,
  },
];

// The seed question that kicks off the dynamic phase
const SEED_QUESTION: DynamicOnboardingQuestion = {
  title: "Tell me a bit about yourself — what do you do, what are you into, what's on your mind lately?",
  subtitle: "No wrong answers here. Just talk to me like you would a new friend.",
  type: "multiline",
  placeholder: "I'm into...",
};

// The final time-picker question
const TIME_PICKER_QUESTION: DynamicOnboardingQuestion = {
  title: "When should I ping you every day?",
  subtitle: "I'll send you a little check-in at this time. You can always change it later!",
  type: "chips",
  options: ["6 AM", "9 AM", "12 PM", "3 PM", "6 PM", "9 PM", "12 AM", "3 AM"],
};

// Max number of dynamic AI rounds (after seed question)
// Only 1 round: seed answer → 1-2 followup questions → time picker
const MAX_DYNAMIC_ROUNDS = 2;

interface StepData {
  question: DynamicOnboardingQuestion;
  answer: string;
  selectedOptions: string[];
  selectedChoice: string;
  phase: "fixed" | "dynamic" | "time-picker";
}

export default function OnboardingScreen() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const { theme } = useTheme();

  const [steps, setSteps] = useState<StepData[]>([
    // Phase 1: Fixed questions
    ...FIXED_QUESTIONS.map((q) => ({
      question: q,
      answer: "",
      selectedOptions: [],
      selectedChoice: "",
      phase: "fixed" as const,
    })),
    // Phase 2: Seed question
    {
      question: SEED_QUESTION,
      answer: "",
      selectedOptions: [],
      selectedChoice: "",
      phase: "dynamic" as const,
    },
  ]);

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dynamicRoundRef = useRef(0);
  const summaryRef = useRef("");

  // Estimate total steps for the progress bar
  // Fixed(2) + Seed(1) + followups(1-2) + time-picker(1) = ~6
  const estimatedTotal = Math.max(steps.length, 6);
  const progress = Math.min((currentStep + 1) / estimatedTotal, 0.95);
  const isTimePickerStep = steps[currentStep]?.phase === "time-picker";
  const isLastStep = isTimePickerStep;

  const currentStepData = steps[currentStep];

  // Get the effective "answer" for the current step based on its type
  const getCurrentAnswer = useCallback((): string => {
    if (!currentStepData) return "";
    if (currentStepData.question.type === "chips") {
      return currentStepData.selectedOptions.join(", ");
    }
    if (currentStepData.question.type === "choice") {
      return currentStepData.selectedChoice;
    }
    return currentStepData.answer;
  }, [currentStepData]);

  const canContinue = (() => {
    if (!currentStepData) return false;
    if (loading || submitting) return false;
    if (currentStepData.question.optional) return true;
    switch (currentStepData.question.type) {
      case "chips":
        return currentStepData.selectedOptions.length > 0;
      case "choice":
        return currentStepData.selectedChoice.length > 0;
      default:
        return currentStepData.answer.trim().length > 0;
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
        if (step.selectedOptions.includes(option)) {
          step.selectedOptions = step.selectedOptions.filter((o) => o !== option);
        } else {
          // For time picker, only allow one selection
          if (step.phase === "time-picker") {
            step.selectedOptions = [option];
          } else {
            step.selectedOptions = [...step.selectedOptions, option];
          }
        }
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
    },
    [currentStep],
  );

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  // Build the conversation history from all completed steps (for AI context)
  const buildConversation = useCallback(
    (upToStep: number): OnboardingQA[] => {
      const convo: OnboardingQA[] = [];
      for (let i = 0; i <= upToStep; i++) {
        const s = steps[i];
        if (!s || s.phase === "time-picker") continue;
        let answer = s.answer;
        if (s.question.type === "chips") answer = s.selectedOptions.join(", ");
        if (s.question.type === "choice") answer = s.selectedChoice;
        if (answer.trim()) {
          convo.push({ question: s.question.title, answer: answer.trim() });
        }
      }
      return convo;
    },
    [steps],
  );

  const handleNext = useCallback(async () => {
    if (!canContinue) return;

    const answer = getCurrentAnswer();
    if (!answer.trim()) return;

    // If this is the time picker step → submit everything
    if (isLastStep) {
      setSubmitting(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      try {
        const userName = steps[0].answer.trim();
        const allyName = steps[1].answer.trim() || "Ally";
        const conversation = buildConversation(currentStep);
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const dailyPingTime = steps[currentStep].selectedOptions[0] || "9 AM";

        const { greeting } = await completeOnboardingDynamic({
          userName,
          allyName,
          conversation,
          dailyPingTime,
          timezone,
        });

        completeOnboarding(
          {
            name: userName,
            allyName,
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

    // If we're in the dynamic phase and haven't exceeded max rounds,
    // call Claude for followup questions
    if (
      currentStepData.phase === "dynamic" &&
      dynamicRoundRef.current < MAX_DYNAMIC_ROUNDS
    ) {
      setLoading(true);
      try {
        const userName = steps[0].answer.trim();
        const allyName = steps[1].answer.trim() || "Ally";
        const conversation = buildConversation(currentStep);

        const { questions: rawQuestions, summary } = await getOnboardingFollowups({
          userName,
          allyName,
          conversation,
          dynamicRound: dynamicRoundRef.current,
        });

        dynamicRoundRef.current += 1;

        // Store the summary for the time-picker subtitle
        if (summary) summaryRef.current = summary;

        // Strictly cap at 3 followup questions
        const questions = rawQuestions.slice(0, 3);

        // Build the time-picker with the personalized summary
        const timePickerStep: StepData = {
          question: {
            ...TIME_PICKER_QUESTION,
            subtitle: summaryRef.current || TIME_PICKER_QUESTION.subtitle,
          },
          answer: "",
          selectedOptions: [],
          selectedChoice: "",
          phase: "time-picker",
        };

        if (questions.length > 0) {
          // Insert followup questions + time-picker at the end
          const newSteps: StepData[] = questions.map((q) => ({
            question: q,
            answer: "",
            selectedOptions: [],
            selectedChoice: "",
            phase: "dynamic" as const,
          }));

          setSteps((prev) => {
            const next = [...prev];
            // Remove any existing time-picker
            const filtered = next.filter((s) => s.phase !== "time-picker");
            return [...filtered, ...newSteps, timePickerStep];
          });
        } else {
          // No followup questions — go straight to time-picker
          setSteps((prev) => {
            const filtered = prev.filter((s) => s.phase !== "time-picker");
            return [...filtered, timePickerStep];
          });
        }
      } catch (err) {
        console.warn("Failed to get followup questions, moving to time picker:", err);
        // On error, just move to time picker
        setSteps((prev) => {
          const filtered = prev.filter((s) => s.phase !== "time-picker");
          return [
            ...filtered,
            {
              question: TIME_PICKER_QUESTION,
              answer: "",
              selectedOptions: [],
              selectedChoice: "",
              phase: "time-picker",
            },
          ];
        });
      } finally {
        setLoading(false);
      }

      setCurrentStep((s) => s + 1);
      return;
    }

    // If this is a fixed step or we've exhausted dynamic rounds,
    // check if we need to add the time picker before advancing
    if (
      currentStepData.phase === "dynamic" &&
      dynamicRoundRef.current >= MAX_DYNAMIC_ROUNDS
    ) {
      setSteps((prev) => {
        const filtered = prev.filter((s) => s.phase !== "time-picker");
        return [
          ...filtered,
          {
            question: {
              ...TIME_PICKER_QUESTION,
              subtitle: summaryRef.current || TIME_PICKER_QUESTION.subtitle,
            },
            answer: "",
            selectedOptions: [],
            selectedChoice: "",
            phase: "time-picker",
          },
        ];
      });
    }

    // For fixed step 2 (birthday), after answering/skipping, make sure
    // the seed question is present
    if (currentStep === 2) {
      setSteps((prev) => {
        if (prev.length <= 2) {
          return [
            ...prev,
            {
              question: SEED_QUESTION,
              answer: "",
              selectedOptions: [],
              selectedChoice: "",
              phase: "dynamic",
            },
          ];
        }
        return prev;
      });
    }

    setCurrentStep((s) => s + 1);
  }, [
    canContinue,
    getCurrentAnswer,
    isLastStep,
    currentStepData,
    currentStep,
    steps,
    buildConversation,
    completeOnboarding,
  ]);

  if (!currentStepData) return null;

  const totalDots = steps.length;

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
            {Array.from({ length: totalDots }).map((_, i) => (
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
        {loading ? (
          <View className="flex-1 justify-center items-center px-8">
            <MotiView
              from={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "timing", duration: 300 }}
              className="items-center"
            >
              <ActivityIndicator
                size="small"
                color={theme.preview.primary}
              />
              <Text className="text-muted text-base font-sans mt-4">
                Thinking...
              </Text>
            </MotiView>
          </View>
        ) : (
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
                type={currentStepData.question.type}
                placeholder={currentStepData.question.placeholder ?? "Type your answer..."}
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
                buttonTitle={
                  submitting
                    ? "Setting things up..."
                    : isLastStep
                      ? "Let's go! 🚀"
                      : "Continue"
                }
              />
            </MotiView>
          </AnimatePresence>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}
