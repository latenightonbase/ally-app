import React from "react";
import { View, Text } from "react-native";
import { MotiView } from "moti";
import { Card } from "../ui/Card";

interface BriefingCardProps {
  title: string;
  icon: string;
  content: string;
  index: number;
}

export function BriefingCard({ title, icon, content, index }: BriefingCardProps) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 20 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{
        type: "spring",
        damping: 18,
        delay: 300 + index * 150,
      }}
      className="mb-4"
    >
      <Card>
        <View className="flex-row items-center mb-3">
          <Text className="text-lg mr-2">{icon}</Text>
          <Text className="text-foreground text-base font-sans-semibold">
            {title}
          </Text>
        </View>
        <Text className="text-foreground/80 text-base font-sans leading-6">
          {content}
        </Text>
      </Card>
    </MotiView>
  );
}
