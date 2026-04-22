import React, { useState } from "react";
import {
  TextInput as RNTextInput,
  View,
  Text,
  TextInputProps as RNTextInputProps,
} from "react-native";
import { useTheme } from "../../context/ThemeContext";

interface TextInputProps extends RNTextInputProps {
  label?: string;
  containerClassName?: string;
}

export function TextInput({
  label,
  containerClassName = "",
  ...props
}: TextInputProps) {
  const { theme } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View className={`w-full ${containerClassName}`}>
      {label && (
        <Text
          className="text-xs font-sans-bold mb-2"
          style={{
            color: theme.colors["--color-muted"],
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          {label}
        </Text>
      )}
      <RNTextInput
        placeholderTextColor={theme.colors["--color-faint"]}
        onFocus={(e) => {
          setIsFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          props.onBlur?.(e);
        }}
        style={{
          backgroundColor: theme.colors["--color-surface"],
          color: theme.colors["--color-foreground"],
          fontSize: 16,
          paddingHorizontal: 18,
          paddingVertical: 14,
          borderRadius: 16,
          borderWidth: isFocused ? 2 : 1,
          borderColor: isFocused
            ? theme.colors["--color-primary"]
            : theme.colors["--color-border"],
        }}
        className="font-sans"
        {...props}
      />
    </View>
  );
}
