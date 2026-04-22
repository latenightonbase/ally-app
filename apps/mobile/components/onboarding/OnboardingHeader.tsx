import React from "react";
import { View, Pressable } from "react-native";
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
    <View className="px-6 pt-3 pb-5">
      <View className="flex-row items-center h-10 mb-4">
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
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors["--color-surface"],
              borderWidth: 1,
              borderColor: theme.colors["--color-border"],
            }}
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={theme.colors["--color-foreground"]}
            />
          </Pressable>
        </MotiView>
      </View>

      <View className="flex-row items-center" style={{ gap: 6 }}>
        {Array.from({ length: totalSteps }).map((_, i) => {
          const active = i < step;
          return (
            <MotiView
              key={i}
              animate={{
                backgroundColor: active
                  ? theme.colors["--color-primary"]
                  : theme.colors["--color-primary-soft"],
              }}
              transition={{ type: "timing", duration: 300 }}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
              }}
            />
          );
        })}
      </View>
    </View>
  );
}
