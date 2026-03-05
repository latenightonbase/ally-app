import React from "react";
import { View, Text } from "react-native";
import { MotiView } from "moti";
import { Avatar } from "../ui/Avatar";

export function TypingIndicator() {
  return (
    <View className="flex-row items-end mb-3">
      <Avatar name="A" size="sm" className="mr-2" />
      <View className="bg-surface rounded-2xl rounded-tl-sm px-4 py-3 flex-row items-center">
        {[0, 1, 2].map((i) => (
          <MotiView
            key={i}
            from={{ opacity: 0.3, translateY: 0 }}
            animate={{ opacity: 1, translateY: -4 }}
            transition={{
              type: "timing",
              duration: 500,
              loop: true,
              delay: i * 150,
              repeatReverse: true,
            }}
            className="w-2 h-2 rounded-full bg-muted mx-0.5"
          />
        ))}
      </View>
    </View>
  );
}
