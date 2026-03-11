import React, { useState } from "react";
import { View, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [text, setText] = useState("");
  const { theme } = useTheme();

  const handleSend = () => {
    if (text.trim().length === 0 || disabled) return;
    onSend(text.trim());
    setText("");
  };

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <View className="flex-row items-end px-4 py-3 bg-background border-t border-surface">
      <View className="flex-1 bg-surface rounded-2xl px-4 py-2.5 mr-3 flex-row items-end">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          placeholderTextColor={theme.colors["--color-muted"]}
          multiline
          maxLength={500}
          style={{
            maxHeight: 100,
            color: theme.colors["--color-foreground"],
            fontSize: 16,
          }}
          className="flex-1 font-sans text-base"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
      </View>

      <Pressable
        onPress={handleSend}
        className={`w-11 h-11 rounded-full items-center justify-center ${
          canSend ? "bg-primary" : "bg-muted/30"
        }`}
      >
        <Ionicons
          name="send"
          size={18}
          color={canSend ? "white" : theme.colors["--color-muted"]}
        />
      </Pressable>
    </View>
  );
}
