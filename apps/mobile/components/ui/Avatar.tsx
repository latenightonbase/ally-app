import React from "react";
import { View, Text } from "react-native";

interface AvatarProps {
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Avatar({ name = "A", size = "md", className = "" }: AvatarProps) {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-14 h-14",
  };

  const textSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-lg",
  };

  const letter = name.charAt(0).toUpperCase();

  return (
    <View
      className={`${sizeClasses[size]} rounded-full bg-primary items-center justify-center ${className}`}
    >
      <Text className={`text-white font-sans-bold ${textSizeClasses[size]}`}>
        {letter}
      </Text>
    </View>
  );
}
