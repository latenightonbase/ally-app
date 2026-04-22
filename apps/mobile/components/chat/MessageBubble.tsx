import React from "react";
import { View, Text } from "react-native";
import { MotiView } from "moti";
import { Avatar } from "../ui/Avatar";
import { useTheme } from "../../context/ThemeContext";
import type { ChatMessage } from "../../store/useAppStore";

interface MessageBubbleProps {
  message: ChatMessage;
  isLatest: boolean;
}

export function MessageBubble({ message, isLatest }: MessageBubbleProps) {
  const { theme } = useTheme();
  const isUser = message.isUser;

  const Wrapper = isLatest ? MotiView : View;
  const wrapperProps = isLatest
    ? {
        from: { opacity: 0, translateY: 6 },
        animate: { opacity: 1, translateY: 0 },
        transition: { type: "timing" as const, duration: 260 },
      }
    : {};

  const timeString = new Date(message.timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const bubbleStyle = isUser
    ? {
        backgroundColor: theme.colors["--color-primary"],
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderBottomLeftRadius: 20,
        borderBottomRightRadius: 4,
        paddingHorizontal: 16,
        paddingVertical: 12,
        shadowColor: theme.colors["--color-primary"],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
        elevation: 3,
      }
    : {
        backgroundColor: theme.colors["--color-surface"],
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderBottomLeftRadius: 4,
        borderBottomRightRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: theme.colors["--color-border"],
      };

  return (
    <Wrapper
      {...wrapperProps}
      className={`flex-row mb-3 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <View style={{ marginRight: 8, marginTop: 2 }}>
          <Avatar
            name="A"
            size="sm"
            color={theme.colors["--color-primary"]}
          />
        </View>
      )}

      <View style={[{ maxWidth: "78%" }, bubbleStyle]}>
        <Text
          className="font-sans"
          style={{
            color: isUser ? "#ffffff" : theme.colors["--color-foreground"],
            fontSize: 15,
            lineHeight: 22,
          }}
        >
          {message.text}
        </Text>
        <Text
          className="text-xs font-sans mt-1"
          style={{
            color: isUser ? "rgba(255,255,255,0.7)" : theme.colors["--color-faint"],
          }}
        >
          {timeString}
        </Text>
      </View>
    </Wrapper>
  );
}
