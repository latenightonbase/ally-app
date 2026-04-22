import React from "react";
import { Pressable, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useTheme } from "../../context/ThemeContext";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.97, { damping: 20, stiffness: 400 });
    setTimeout(() => {
      scale.value = withSpring(1, { damping: 20, stiffness: 400 });
    }, 100);
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      style={[
        animatedStyle,
        {
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 999,
          marginRight: 8,
          marginBottom: 8,
          backgroundColor: selected
            ? theme.colors["--color-primary-soft"]
            : theme.colors["--color-surface"],
          borderWidth: 1.5,
          borderColor: selected
            ? theme.colors["--color-primary"]
            : theme.colors["--color-border"],
          shadowColor: selected ? theme.colors["--color-primary"] : "transparent",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: selected ? 0.18 : 0,
          shadowRadius: 12,
          elevation: selected ? 2 : 0,
        },
      ]}
    >
      <Text
        className="text-sm font-sans-bold"
        style={{
          color: selected
            ? theme.colors["--color-primary"]
            : theme.colors["--color-foreground"],
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
