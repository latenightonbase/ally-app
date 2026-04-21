import React, { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ChoiceRowProps {
  label: string;
  leading?: string; // emoji or short prefix
  selected: boolean;
  onPress: () => void;
}

export function ChoiceRow({
  label,
  leading,
  selected,
  onPress,
}: ChoiceRowProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const borderProgress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    borderProgress.value = withTiming(selected ? 1 : 0, { duration: 220 });
  }, [selected]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderColor: selected
      ? theme.colors["--color-primary"]
      : theme.colors["--color-muted"] + "33",
    borderWidth: selected ? 2 : 1,
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 18, stiffness: 320 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 18, stiffness: 320 });
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={animatedStyle}
      className="flex-row items-center px-5 py-4 rounded-2xl bg-surface"
    >
      {leading && <Text className="text-xl mr-3">{leading}</Text>}
      <Text
        className={`text-base flex-1 ${
          selected
            ? "text-foreground font-sans-semibold"
            : "text-foreground font-sans"
        }`}
      >
        {label}
      </Text>
      <View
        className={`w-6 h-6 rounded-full items-center justify-center ${
          selected ? "bg-primary" : "border-2 border-muted/40"
        }`}
      >
        {selected && <Ionicons name="checkmark" size={14} color="#ffffff" />}
      </View>
    </AnimatedPressable>
  );
}
