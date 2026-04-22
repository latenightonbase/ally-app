import React from "react";
import { Text, Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

interface PrimaryCTAProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: IoniconsName;
  variant?: "solid" | "ghost" | "soft";
}

export function PrimaryCTA({
  title,
  onPress,
  disabled = false,
  icon = "arrow-forward",
  variant = "solid",
}: PrimaryCTAProps) {
  const { theme } = useTheme();
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
        style={({ pressed }) => ({
          opacity: pressed && !disabled ? 0.6 : 1,
        })}
      >
        <Text
          className="font-sans-medium text-sm"
          style={{ color: theme.colors["--color-muted"] }}
        >
          {title}
        </Text>
      </Pressable>
    );
  }

  if (variant === "soft") {
    return (
      <AnimatedPressable
        onPress={disabled ? undefined : onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={[
          animatedStyle,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            height: 54,
            paddingHorizontal: 22,
            borderRadius: 18,
            backgroundColor: theme.colors["--color-primary-soft"],
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Text
          className="font-sans-semibold"
          style={{
            color: theme.colors["--color-primary"],
            fontSize: 16,
            marginRight: 8,
          }}
        >
          {title}
        </Text>
        <Ionicons
          name={icon}
          size={18}
          color={theme.colors["--color-primary"]}
        />
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={disabled ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[
        animatedStyle,
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          height: 54,
          paddingHorizontal: 22,
          borderRadius: 18,
          backgroundColor: theme.colors["--color-primary"],
          opacity: disabled ? 0.5 : 1,
          shadowColor: theme.colors["--color-primary"],
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: disabled ? 0 : 0.4,
          shadowRadius: 20,
          elevation: disabled ? 0 : 6,
        },
      ]}
    >
      <Text
        className="font-sans-semibold text-white"
        style={{ fontSize: 16, marginRight: 8 }}
      >
        {title}
      </Text>
      <View>
        <Ionicons name={icon} size={18} color="#ffffff" />
      </View>
    </AnimatedPressable>
  );
}
