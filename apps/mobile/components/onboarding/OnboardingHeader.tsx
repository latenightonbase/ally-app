import React from "react";
import { View, Text, Pressable } from "react-native";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useTheme } from "../../context/ThemeContext";

interface OnboardingHeaderProps {
  step: number; // 1-based
  totalSteps: number;
  canGoBack?: boolean;
  onBack?: () => void;
}

export function OnboardingHeader({
  step,
  totalSteps,
  canGoBack = true,
  onBack,
}: OnboardingHeaderProps) {
  const { theme } = useTheme();
  const progress = Math.max(0, Math.min(1, step / totalSteps));
  const showBack = canGoBack && step > 1;

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onBack) {
      onBack();
    } else if (router.canGoBack()) {
      router.back();
    }
  };

  return (
    <View className="px-6 pt-2 pb-4">
      <View className="flex-row items-center justify-between h-10 mb-3">
        <MotiView
          animate={{
            opacity: showBack ? 1 : 0,
            translateX: showBack ? 0 : -6,
          }}
          transition={{ type: "timing", duration: 220 }}
          pointerEvents={showBack ? "auto" : "none"}
        >
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            className="w-10 h-10 rounded-full items-center justify-center bg-surface/80"
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={theme.colors["--color-foreground"]}
            />
          </Pressable>
        </MotiView>

        <MotiView
          key={`counter-${step}`}
          from={{ opacity: 0, translateY: -4 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 300 }}
        >
          <Text className="text-muted text-xs font-sans-semibold tracking-widest uppercase">
            {step} / {totalSteps}
          </Text>
        </MotiView>

        <View className="w-10" />
      </View>

      <View className="h-1 rounded-full bg-surface overflow-hidden">
        <MotiView
          animate={{ width: `${Math.max(5, progress * 100)}%` }}
          transition={{ type: "timing", duration: 600 }}
          className="h-full rounded-full bg-primary"
        />
      </View>
    </View>
  );
}
