import React, { useEffect } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useTheme } from "../../context/ThemeContext";
import { DitheringShader } from "../ui/dithering-shader";

interface ProgressBackgroundProps {
  progress: number; // 0 to 1
}

export function ProgressBackground({ progress }: ProgressBackgroundProps) {
  const { theme } = useTheme();
  const { height } = useWindowDimensions();
  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    animatedProgress.value = withTiming(progress, {
      duration: 1200,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [progress]);

  // Animated wrapper that clips the shader — rises from bottom as progress grows
  const shaderContainerStyle = useAnimatedStyle(() => {
    const h = animatedProgress.value * height;
    return {
      position: "absolute" as const,
      left: 0,
      right: 0,
      bottom: 0,
      height: Math.max(0, h),
      overflow: "hidden" as const,
    };
  });

  // Use theme colours for the dithering effect
  const colorBack = theme.preview.background;
  const colorFront = theme.preview.primary;

  return (
    <View className="absolute inset-0 overflow-hidden" pointerEvents="none" style={{ zIndex: 0 }}>
      {/* Animated container that rises from the bottom */}
      <Animated.View style={shaderContainerStyle}>
        <DitheringShader
          shape="wave"
          type="8x8"
          colorBack={colorBack}
          colorFront={colorFront}
          pxSize={3}
          speed={0.6}
          revealProgress={1}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, height: "100%", opacity: 0.5 }}
        />
      </Animated.View>
    </View>
  );
}
