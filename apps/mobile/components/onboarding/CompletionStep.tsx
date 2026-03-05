import React from "react";
import { View, Text } from "react-native";
import { MotiView } from "moti";
import { Button } from "../ui/Button";

interface CompletionStepProps {
  name: string;
  allyName: string;
  onFinish: () => void;
}

export function CompletionStep({ name, allyName, onFinish }: CompletionStepProps) {
  return (
    <View className="flex-1 justify-center items-center px-8">
      <MotiView
        from={{ opacity: 0, translateY: 18 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 700, delay: 100 }}
        className="items-center"
      >
        {/* Bot avatar with first letter of chosen name */}
        <View className="w-28 h-28 rounded-full bg-primary items-center justify-center mb-8">
          <Text className="text-white text-5xl font-sans-bold">{allyName.charAt(0).toUpperCase()}</Text>
        </View>
      </MotiView>

      <MotiView
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 600, delay: 400 }}
        className="items-center"
      >
        <Text className="text-foreground text-3xl font-sans-bold text-center mb-4">
          Nice to meet you, {name}!
        </Text>
        <Text className="text-muted text-base font-sans text-center leading-6 px-4">
          I'm {allyName}, and I'm going to remember everything you've shared. The more we talk, the better I'll know you.
        </Text>
      </MotiView>

      <MotiView
        from={{ opacity: 0, translateY: 10 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 500, delay: 650 }}
        className="w-full mt-12"
      >
        <Button title="Start chatting →" onPress={onFinish} size="lg" />
      </MotiView>
    </View>
  );
}
