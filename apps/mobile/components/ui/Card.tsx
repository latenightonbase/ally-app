import React from "react";
import { View } from "react-native";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <View className={`bg-surface rounded-3xl p-5 ${className}`}>
      {children}
    </View>
  );
}
