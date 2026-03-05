import React, { useState } from "react";
import {
  TextInput as RNTextInput,
  View,
  Text,
  TextInputProps as RNTextInputProps,
} from "react-native";

interface TextInputProps extends RNTextInputProps {
  label?: string;
  containerClassName?: string;
}

export function TextInput({
  label,
  containerClassName = "",
  ...props
}: TextInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View className={`w-full ${containerClassName}`}>
      {label && (
        <Text className="text-muted text-sm font-sans-medium mb-2">
          {label}
        </Text>
      )}
      <RNTextInput
        placeholderTextColor="#9C9589"
        onFocus={(e) => {
          setIsFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          props.onBlur?.(e);
        }}
        className={`bg-surface text-foreground font-sans text-base px-4 py-3.5 rounded-2xl ${
          isFocused ? "border-2 border-primary" : "border-2 border-transparent"
        }`}
        {...props}
      />
    </View>
  );
}
