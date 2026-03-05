import React from "react";
import { View, Text } from "react-native";
import { MotiView } from "moti";
import { Button } from "../ui/Button";

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <View className="flex-1 justify-center items-center px-8">
      <MotiView
        from={{ opacity: 0, translateY: 16 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 700, delay: 100 }}
        className="items-center"
      >
        {/* Bot logo circle */}
        <View className="w-24 h-24 rounded-full bg-primary items-center justify-center mb-8">
          <Text className="text-white text-4xl font-sans-bold">👋</Text>
        </View>
      </MotiView>

      <MotiView
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 600, delay: 350 }}
        className="items-center"
      >
        <Text className="text-foreground text-3xl font-sans-bold text-center mb-4">
          Hey there!
        </Text>
        <Text className="text-muted text-lg font-sans text-center leading-7 mb-2">
          I'm your Ally — a friend who never forgets.
        </Text>
        <Text className="text-muted text-base font-sans text-center leading-6 px-4">
          Let's start by getting to know each other. First up — you get to give me a name!
        </Text>
      </MotiView>

      <MotiView
        from={{ opacity: 0, translateY: 10 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 500, delay: 600 }}
        className="w-full mt-12"
      >
        <Button title="Let's get started" onPress={onNext} size="lg" />
      </MotiView>
    </View>
  );
}
