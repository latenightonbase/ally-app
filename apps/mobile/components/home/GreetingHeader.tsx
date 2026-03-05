import React from "react";
import { View, Text } from "react-native";
import { MotiView } from "moti";
import { getGreetingByTime, formatDate } from "../../constants/mockData";

interface GreetingHeaderProps {
  name: string;
}

export function GreetingHeader({ name }: GreetingHeaderProps) {
  const greeting = getGreetingByTime();
  const date = formatDate();

  return (
    <MotiView
      from={{ opacity: 0, translateY: -10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "spring", damping: 18, delay: 100 }}
      className="mb-6"
    >
      <Text className="text-muted text-sm font-sans-medium mb-1">{date}</Text>
      <Text className="text-foreground text-2xl font-sans-bold">
        {greeting}, {name} ☀️
      </Text>
    </MotiView>
  );
}
