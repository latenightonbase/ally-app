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
import { sendMessage } from "../../lib/api";

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
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const setActiveConversationId = useAppStore((s) => s.setActiveConversationId);
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();

  const tabBarHeight = 64 + Math.max(insets.bottom, Platform.OS === "ios" ? 16 : 12) + 16;

  const handleSend = useCallback(
    async (text: string) => {
      addMessage(text, true);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

      setIsTyping(true);

      try {
        const result = await sendMessage(
          text,
          activeConversationId ?? undefined,
        );

        if (!activeConversationId) {
          setActiveConversationId(result.conversationId);
        }

        addMessage(result.response, false);
      } catch (e) {
        const errMsg =
          e instanceof Error ? e.message : "Something went wrong";
        addMessage(`Sorry, I couldn't respond right now. ${errMsg}`, false);
      } finally {
        setIsTyping(false);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    },
    [addMessage, activeConversationId, setActiveConversationId],
  );

  const handleSuggestionPress = useCallback(
    (suggestion: string) => {
      handleSend(suggestion);
    },
    [handleSend],
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
