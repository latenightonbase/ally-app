import React from "react";
import { Pressable, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.92, { damping: 12, stiffness: 400 });
    setTimeout(() => {
      scale.value = withSpring(1, { damping: 12, stiffness: 400 });
    }, 100);
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      style={animatedStyle}
      className={`px-4 py-2.5 rounded-full mr-2 mb-2 ${
        selected
          ? "bg-primary"
          : "bg-surface border border-muted/30"
      }`}
    >
      <Text
        className={`text-sm font-sans-medium ${
          selected ? "text-white" : "text-foreground"
        }`}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
