import React from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useTheme } from "../../context/ThemeContext";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg" | "pill";
  disabled?: boolean;
  className?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  className = "",
  leftIcon,
  rightIcon,
}: ButtonProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const sizeStyle = (() => {
    switch (size) {
      case "sm":
        return { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 14 };
      case "md":
        return { paddingVertical: 13, paddingHorizontal: 22, borderRadius: 18 };
      case "lg":
        return { paddingVertical: 15, paddingHorizontal: 24, borderRadius: 20 };
      case "pill":
        return { paddingVertical: 16, paddingHorizontal: 28, borderRadius: 18 };
    }
  })();

  const textSize = (() => {
    switch (size) {
      case "sm":
        return 13;
      case "md":
        return 15;
      case "lg":
        return 16;
      case "pill":
        return 17;
    }
  })();

  const containerStyle = (() => {
    switch (variant) {
      case "primary":
        return {
          backgroundColor: theme.colors["--color-primary"],
          shadowColor: theme.colors["--color-primary"],
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: disabled ? 0 : 0.35,
          shadowRadius: 20,
          elevation: disabled ? 0 : 5,
        };
      case "secondary":
        return {
          backgroundColor: theme.colors["--color-primary-soft"],
        };
      case "outline":
        return {
          backgroundColor: theme.colors["--color-surface"],
          borderWidth: 1.5,
          borderColor: theme.colors["--color-border"],
        };
      case "ghost":
        return {
          backgroundColor: "transparent",
        };
    }
  })();

  const textColor = (() => {
    switch (variant) {
      case "primary":
        return "#ffffff";
      case "secondary":
        return theme.colors["--color-primary"];
      case "outline":
        return theme.colors["--color-foreground"];
      case "ghost":
        return theme.colors["--color-primary"];
    }
  })();

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[
        animatedStyle,
        sizeStyle,
        containerStyle,
        {
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      className={className}
    >
      {leftIcon ? <View style={{ marginRight: 8 }}>{leftIcon}</View> : null}
      <Text
        className="font-sans-bold"
        style={{ color: textColor, fontSize: textSize }}
      >
        {title}
      </Text>
      {rightIcon ? <View style={{ marginLeft: 8 }}>{rightIcon}</View> : null}
    </AnimatedPressable>
  );
}
