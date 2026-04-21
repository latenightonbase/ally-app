import React from "react";
import {
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { OnboardingHeader } from "./OnboardingHeader";

interface OnboardingShellProps {
  step: number;
  totalSteps: number;
  canGoBack?: boolean;
  onBack?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  keyboardAvoiding?: boolean;
  scrollContentStyle?: ScrollViewProps["contentContainerStyle"];
}

export function OnboardingShell({
  step,
  totalSteps,
  canGoBack = true,
  onBack,
  children,
  footer,
  keyboardAvoiding = false,
  scrollContentStyle,
}: OnboardingShellProps) {
  const content = (
    <View className="flex-1">
      <ScrollView
        contentContainerStyle={[{ flexGrow: 1 }, scrollContentStyle]}
        keyboardShouldPersistTaps="handled"
        className="px-6"
        showsVerticalScrollIndicator={false}
      >
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 500 }}
          className="flex-1 pt-4"
        >
          {children}
        </MotiView>
      </ScrollView>

      {footer && (
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 450, delay: 200 }}
          className="px-6 pb-6 pt-2"
        >
          {footer}
        </MotiView>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top", "bottom"]} className="flex-1">
        <OnboardingHeader
          step={step}
          totalSteps={totalSteps}
          canGoBack={canGoBack}
          onBack={onBack}
        />
        {keyboardAvoiding ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1"
          >
            {content}
          </KeyboardAvoidingView>
        ) : (
          content
        )}
      </SafeAreaView>
    </View>
  );
}
