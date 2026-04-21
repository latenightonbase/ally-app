import React from "react";
import { Text, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

interface PrimaryCTAProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: IoniconsName;
  variant?: "solid" | "ghost";
}

export function PrimaryCTA({
  title,
  onPress,
  disabled = false,
  icon = "arrow-forward",
  variant = "solid",
}: PrimaryCTAProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(0.97, { damping: 16, stiffness: 320 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 16, stiffness: 320 });
  };

  if (variant === "ghost") {
    return (
      <Pressable
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
        className="items-center justify-center py-3"
        style={({ pressed }) => ({ opacity: pressed && !disabled ? 0.6 : 1 })}
      >
        <Text className="text-muted font-sans-medium text-sm">{title}</Text>
      </Pressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={disabled ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={animatedStyle}
      className={`flex-row items-center justify-center bg-primary rounded-full py-4 px-6 ${
        disabled ? "opacity-40" : ""
      }`}
    >
      <Text className="text-white font-sans-semibold text-base mr-2">
        {title}
      </Text>
      <Ionicons name={icon} size={18} color="#ffffff" />
    </AnimatedPressable>
  );
}
