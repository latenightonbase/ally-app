import React, { useRef, useState, useCallback } from "react";
import {
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatHeader } from "../../components/chat/ChatHeader";
import { MessageBubble } from "../../components/chat/MessageBubble";
import { ChatInput } from "../../components/chat/ChatInput";
import { TypingIndicator } from "../../components/chat/TypingIndicator";
import { useAppStore } from "../../store/useAppStore";
import { MOCK_ALLY_RESPONSES } from "../../constants/mockData";

const CHAT_SUGGESTIONS = [
  "How are you feeling today?",
  "Tell me something interesting",
  "Help me plan my day",
  "I need advice on something",
  "What should I focus on?",
  "I'm feeling stressed",
];

export default function ChatScreen() {
  const messages = useAppStore((s) => s.messages);
  const addMessage = useAppStore((s) => s.addMessage);
  const user = useAppStore((s) => s.user);
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const responseIndexRef = useRef(0);
  const insets = useSafeAreaInsets();

  // Height of floating tab bar (64) + bottom inset/margin + extra spacing
  const tabBarHeight = 64 + Math.max(insets.bottom, Platform.OS === "ios" ? 16 : 12) + 16;

  const getAllyResponse = useCallback(() => {
    const template =
      MOCK_ALLY_RESPONSES[responseIndexRef.current % MOCK_ALLY_RESPONSES.length];
    responseIndexRef.current += 1;

    return template
      .replace("{name}", user.name)
      .replace(
        "{interests}",
        user.interests.length > 0
          ? user.interests[Math.floor(Math.random() * user.interests.length)]
          : "the things you enjoy"
      );
  }, [user.name, user.interests]);

  const handleSend = useCallback(
    (text: string) => {
      addMessage(text, true);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        const response = getAllyResponse();
        addMessage(response, false);

        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }, 1500 + Math.random() * 1000);
    },
    [addMessage, getAllyResponse]
  );

  const handleSuggestionPress = useCallback(
    (suggestion: string) => {
      handleSend(suggestion);
    },
    [handleSend]
  );

  const showSuggestions = messages.length <= 1;

  return (
    <View className="flex-1 bg-background">
      <ChatHeader />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <MessageBubble
              message={item}
              isLatest={index === messages.length - 1}
            />
          )}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 8,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            flatListRef.current?.scrollToEnd({ animated: false });
          }}
          ListFooterComponent={
            <>
              {isTyping && <TypingIndicator />}
              {showSuggestions && (
                <View className="mt-4 mb-2">
                  <Text className="text-muted text-sm font-sans-semibold mb-3 px-1">
                    Suggestions
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {CHAT_SUGGESTIONS.map((suggestion) => (
                      <Pressable
                        key={suggestion}
                        onPress={() => handleSuggestionPress(suggestion)}
                        className="bg-surface border border-primary-soft rounded-2xl px-4 py-2.5 active:opacity-70"
                      >
                        <Text className="text-foreground text-sm font-sans">
                          {suggestion}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </>
          }
        />

        <View style={{ paddingBottom: tabBarHeight }}>
          <ChatInput onSend={handleSend} disabled={isTyping} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
