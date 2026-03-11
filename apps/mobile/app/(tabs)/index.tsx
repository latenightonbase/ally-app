import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatHeader } from "../../components/chat/ChatHeader";
import { MessageBubble } from "../../components/chat/MessageBubble";
import { ChatInput } from "../../components/chat/ChatInput";
import { TypingIndicator } from "../../components/chat/TypingIndicator";
import { useAppStore, type ChatMessage } from "../../store/useAppStore";
import {
  sendMessageStreaming,
  getConversations,
  getConversationMessages,
  type Message,
} from "../../lib/api";

const CHAT_SUGGESTIONS = [
  "How are you feeling today?",
  "Tell me something interesting",
  "Help me plan my day",
  "I need advice on something",
  "What should I focus on?",
  "I'm feeling stressed",
];

function toLocalMessage(m: Message): ChatMessage {
  return {
    id: m.id,
    text: m.content,
    isUser: m.role === "user",
    timestamp: new Date(m.createdAt),
  };
}

export default function ChatScreen() {
  const messages = useAppStore((s) => s.messages);
  const addMessage = useAppStore((s) => s.addMessage);
  const updateLastMessage = useAppStore((s) => s.updateLastMessage);
  const setMessages = useAppStore((s) => s.setMessages);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const setActiveConversationId = useAppStore((s) => s.setActiveConversationId);

  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const hasHydrated = useRef(false);
  const insets = useSafeAreaInsets();

  const tabBarHeight =
    64 + Math.max(insets.bottom, Platform.OS === "ios" ? 16 : 12) + 16;

  useEffect(() => {
    if (hasHydrated.current) return;
    hasHydrated.current = true;

    (async () => {
      try {
        const { conversations } = await getConversations(1, 0);
        if (conversations.length === 0) return;

        const conv = conversations[0];
        const { messages: serverMessages } = await getConversationMessages(
          conv.id,
          50,
        );
        setMessages(serverMessages.map(toLocalMessage));
        setActiveConversationId(conv.id);
      } catch {
        // Keep local state on network failure — hydration is best-effort
      } finally {
        setIsHydrating(false);
      }
    })();
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      addMessage(text, true);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

      setIsTyping(true);

      try {
        let streamStarted = false;

        await sendMessageStreaming(
          text,
          {
            onToken: (token) => {
              if (!streamStarted) {
                streamStarted = true;
                setIsTyping(false);
                setIsStreaming(true);
                addMessage(token, false);
              } else {
                updateLastMessage(token);
              }
              flatListRef.current?.scrollToEnd({ animated: false });
            },
            onDone: (data) => {
              if (!activeConversationId) {
                setActiveConversationId(data.conversationId);
              }
              setIsStreaming(false);
            },
            onError: (errMsg) => {
              if (!streamStarted) {
                addMessage(
                  `Sorry, I couldn't respond right now. ${errMsg}`,
                  false,
                );
              }
              setIsStreaming(false);
              setIsTyping(false);
            },
          },
          activeConversationId ?? undefined,
        );
      } catch (e) {
        const errMsg =
          e instanceof Error ? e.message : "Something went wrong";
        addMessage(`Sorry, I couldn't respond right now. ${errMsg}`, false);
      } finally {
        setIsTyping(false);
        setIsStreaming(false);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    },
    [addMessage, updateLastMessage, activeConversationId, setActiveConversationId],
  );

  const handleSuggestionPress = useCallback(
    (suggestion: string) => {
      handleSend(suggestion);
    },
    [handleSend],
  );

  const showSuggestions = messages.length <= 1;

  if (isHydrating) {
    return (
      <View className="flex-1 bg-background">
        <ChatHeader />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" className="text-primary" />
        </View>
      </View>
    );
  }

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
          <ChatInput onSend={handleSend} disabled={isTyping || isStreaming} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
