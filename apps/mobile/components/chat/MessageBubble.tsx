import React from "react";
import { View, Text } from "react-native";
import { MotiView } from "moti";
import { Avatar } from "../ui/Avatar";
import type { ChatMessage } from "../../store/useAppStore";

interface MessageBubbleProps {
  message: ChatMessage;
  isLatest: boolean;
}

export function MessageBubble({ message, isLatest }: MessageBubbleProps) {
  const isUser = message.isUser;

  const Wrapper = isLatest ? MotiView : View;
  const wrapperProps = isLatest
    ? {
        from: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { type: "timing" as const, duration: 300 },
      }
    : {};

  const timeString = new Date(message.timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Wrapper
      {...wrapperProps}
      className={`flex-row mb-3 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <Avatar name="A" size="sm" className="mr-2 mt-1" />
      )}

      <View
        className={`max-w-[78%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-primary rounded-tr-sm"
            : "bg-surface rounded-tl-sm"
        }`}
      >
        <Text
          className={`text-base font-sans leading-6 ${
            isUser ? "text-white" : "text-foreground"
          }`}
        >
          {message.text}
        </Text>
        <Text
          className={`text-xs font-sans mt-1 ${
            isUser ? "text-white/60" : "text-muted"
          }`}
        >
          {timeString}
        </Text>
      </View>
    </Wrapper>
  );
}
