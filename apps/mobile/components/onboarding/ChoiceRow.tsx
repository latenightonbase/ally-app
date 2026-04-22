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
  description?: string;
  leading?: string; // emoji or short prefix
  selected: boolean;
  onPress: () => void;
}

export function ChoiceRow({
  label,
  description,
  leading,
  selected,
  onPress,
}: ChoiceRowProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const anim = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    anim.value = withTiming(selected ? 1 : 0, { duration: 220 });
  }, [selected]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderColor: selected
      ? theme.colors["--color-primary"]
      : theme.colors["--color-border"],
    borderWidth: selected ? 2 : 1,
    backgroundColor: selected
      ? theme.colors["--color-primary-soft"]
      : theme.colors["--color-surface"],
    shadowOpacity: selected ? 0.14 : 0.04,
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
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 18,
          paddingVertical: 16,
          borderRadius: 18,
          shadowColor: theme.colors["--color-primary"],
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 14,
        },
        animatedStyle,
      ]}
    >
      {leading && (
        <Text className="mr-3" style={{ fontSize: 22 }}>
          {leading}
        </Text>
      )}
      <View style={{ flex: 1 }}>
        <Text
          className={selected ? "font-sans-bold" : "font-sans-semibold"}
          style={{
            color: theme.colors["--color-foreground"],
            fontSize: 15,
          }}
        >
          {label}
        </Text>
        {description && (
          <Text
            className="font-sans mt-0.5"
            style={{
              color: theme.colors["--color-muted"],
              fontSize: 13,
            }}
          >
            {description}
          </Text>
        )}
      </View>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: selected
            ? theme.colors["--color-primary"]
            : "transparent",
          borderWidth: selected ? 0 : 2,
          borderColor: theme.colors["--color-border"],
        }}
      >
        {selected && <Ionicons name="checkmark" size={14} color="#ffffff" />}
      </View>
    </AnimatedPressable>
  );
}
