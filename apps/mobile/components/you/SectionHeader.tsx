import React from "react";
import { View, Text } from "react-native";

interface SectionHeaderProps {
  title: string;
}

export function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <Text className="text-foreground text-base font-sans-semibold mb-3 mt-2 px-1 uppercase tracking-wider text-xs text-muted">
      {title}
    </Text>
  );
}
