import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Text,
  Pressable,
  Animated,
  AppState,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { ChatHeader } from "../../components/chat/ChatHeader";
import { MessageBubble } from "../../components/chat/MessageBubble";
import { ChatInput } from "../../components/chat/ChatInput";
import { TypingIndicator } from "../../components/chat/TypingIndicator";
import { useAppStore, type ChatMessage } from "../../store/useAppStore";
import { useTheme } from "../../context/ThemeContext";
import {
  sendMessageStreaming,
  sendMessageFeedback,
  getConversations,
  getConversationMessages,
  getConversationStatus,
  ApiError,
  OfflineError,
  type Message,
} from "../../lib/api";
import { useSession } from "../../lib/auth";

const CHAT_SUGGESTIONS = [
  "Plan our week",
  "Add a grocery item",
  "Set a reminder",
  "What's coming up?",
];

function SuggestionChips({
  onPress,
}: {
  onPress: (suggestion: string) => void;
}) {
  const { theme } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingTop: 4 }}
    >
      {CHAT_SUGGESTIONS.map((suggestion) => (
        <Pressable
          key={suggestion}
          onPress={() => onPress(suggestion)}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: theme.colors["--color-surface"],
            borderWidth: 1,
            borderColor: theme.colors["--color-primary-soft"],
          }}
        >
          <Text
            className="font-sans-semibold"
            style={{
              color: theme.colors["--color-primary"],
              fontSize: 13,
            }}
          >
            {suggestion}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function toLocalMessage(m: Message): ChatMessage {
  return {
    id: m.id,
    text: m.content,
    isUser: m.role === "user",
    timestamp: new Date(m.createdAt),
  };
}

interface RateLimitBannerProps {
  visible: boolean;
  resetTime?: string;
  onDismiss: () => void;
}

function RateLimitBanner({ visible, resetTime, onDismiss }: RateLimitBannerProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const { theme } = useTheme();

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (!visible) return null;

  const resetLabel = resetTime
    ? (() => {
        const ms = parseInt(resetTime, 10) * 1000 - Date.now();
        if (ms <= 0) return null;
        const secs = Math.ceil(ms / 1000);
        return secs < 60 ? `${secs}s` : `${Math.ceil(secs / 60)}m`;
      })()
    : null;

  return (
    <Animated.View style={{ opacity }}>
      <View
        className="mx-4 mb-2 px-4 py-3 rounded-2xl flex-row items-center justify-between"
        style={{ backgroundColor: theme.colors["--color-danger"] + "20" }}
      >
        <View className="flex-row items-center gap-2 flex-1">
          <Ionicons
            name="time-outline"
            size={16}
            color={theme.colors["--color-danger"]}
          />
          <Text className="text-danger text-sm font-sans flex-1" numberOfLines={1}>
            Rate limit reached{resetLabel ? ` — resets in ${resetLabel}` : ""}
          </Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Ionicons
            name="close"
            size={16}
            color={theme.colors["--color-danger"]}
          />
        </Pressable>
      </View>
    </Animated.View>
  );
}

function OfflineBanner({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const { theme } = useTheme();

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={{ opacity }}>
      <View
        className="mx-4 mb-2 px-4 py-3 rounded-2xl flex-row items-center"
        style={{ backgroundColor: theme.colors["--color-muted"] + "25" }}
      >
        <View className="flex-row items-center gap-2 flex-1">
          <Ionicons
            name="cloud-offline-outline"
            size={16}
            color={theme.colors["--color-muted"]}
          />
          <Text className="text-muted text-sm font-sans flex-1" numberOfLines={1}>
            You're offline — messages will send when you reconnect
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

interface FeedbackRowProps {
  messageId: string;
}

function FeedbackRow({ messageId }: FeedbackRowProps) {
  const { theme } = useTheme();
  const [vote, setVote] = useState<1 | -1 | null>(null);

  const handleVote = useCallback(
    async (value: 1 | -1) => {
      if (vote !== null) return;
      setVote(value);
      try {
        await sendMessageFeedback(messageId, value);
      } catch {
        // Non-critical — feedback is best-effort
      }
    },
    [messageId, vote],
  );

  return (
    <View className="flex-row gap-3 px-4 pb-1">
      <Pressable
        onPress={() => handleVote(1)}
        hitSlop={8}
        className="opacity-70 active:opacity-100"
      >
        <Ionicons
          name={vote === 1 ? "thumbs-up" : "thumbs-up-outline"}
          size={15}
          color={
            vote === 1
              ? theme.colors["--color-primary"]
              : theme.colors["--color-muted"]
          }
        />
      </Pressable>
      <Pressable
        onPress={() => handleVote(-1)}
        hitSlop={8}
        className="opacity-70 active:opacity-100"
      >
        <Ionicons
          name={vote === -1 ? "thumbs-down" : "thumbs-down-outline"}
          size={15}
          color={
            vote === -1
              ? theme.colors["--color-danger"]
              : theme.colors["--color-muted"]
          }
        />
      </Pressable>
    </View>
  );
}

export default function ChatScreen() {
  const messages = useAppStore((s) => s.messages);
  const addMessage = useAppStore((s) => s.addMessage);
  const updateLastMessage = useAppStore((s) => s.updateLastMessage);
  const replaceLastMessage = useAppStore((s) => s.replaceLastMessage);
  const setMessages = useAppStore((s) => s.setMessages);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const setActiveConversationId = useAppStore((s) => s.setActiveConversationId);
  const isConnected = useAppStore((s) => s.isConnected);
  const pendingRetryMessage = useAppStore((s) => s.pendingRetryMessage);
  const setPendingRetryMessage = useAppStore((s) => s.setPendingRetryMessage);

  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [rateLimitVisible, setRateLimitVisible] = useState(false);
  const [rateLimitReset, setRateLimitReset] = useState<string | undefined>();
  const [lastAIMessageId, setLastAIMessageId] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const hasHydrated = useRef(false);
  const previousUserId = useRef<string | null>(null);
  const insets = useSafeAreaInsets();
  const { data: session } = useSession();

  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardWillShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardWillHide", () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const tabBarHeight =
    64 + Math.max(insets.bottom, Platform.OS === "ios" ? 16 : 12) + 16;

  // Reset hydration guard when the authenticated user changes
  useEffect(() => {
    const currentUserId = session?.user?.id ?? null;

    if (!currentUserId) {
      // Logged out — reset so next login re-fetches
      hasHydrated.current = false;
      previousUserId.current = null;
      return;
    }

    if (previousUserId.current && previousUserId.current !== currentUserId) {
      // Different user — force re-hydration
      hasHydrated.current = false;
      setMessages([]);
      setActiveConversationId(null);
      setIsHydrating(true);
    }

    previousUserId.current = currentUserId;
  }, [session]);

  // Hydrate chat from server on mount or after user switch
  useEffect(() => {
    if (hasHydrated.current) return;
    if (!session?.user?.id) return;
    hasHydrated.current = true;

    setMessages([]);
    setActiveConversationId(null);

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
  }, [session]);

  // Lightweight poll for server-side messages (reminders, daily pings, etc.)
  // Checks a cheap status endpoint every 30s; only fetches full messages when
  // the conversation has been updated since we last checked.
  const lastSeenAtRef = useRef<string | null>(null);

  useEffect(() => {
    const POLL_INTERVAL_MS = 30_000;

    const poll = async () => {
      const convId = useAppStore.getState().activeConversationId;
      if (!convId) return;
      // Don't poll while the user is actively sending / receiving a stream
      if (isStreaming || isTyping) return;

      try {
        // Cheap call — returns just { messageCount, lastMessageAt }
        const status = await getConversationStatus(convId);

        // Only do a full fetch when the conversation has new activity
        if (lastSeenAtRef.current && status.lastMessageAt !== lastSeenAtRef.current) {
          const { messages: serverMessages } = await getConversationMessages(
            convId,
            50,
          );
          const prevCount = useAppStore.getState().messages.length;
          setMessages(serverMessages.map(toLocalMessage));
          if (serverMessages.length > prevCount) {
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
          }
        }

        // Always track the latest timestamp we've seen
        lastSeenAtRef.current = status.lastMessageAt;
      } catch {
        // Polling is best-effort — don't disturb the user on failure
      }
    };

    // Seed the ref immediately so the first real poll can detect changes
    const seed = async () => {
      const convId = useAppStore.getState().activeConversationId;
      if (!convId) return;
      try {
        const status = await getConversationStatus(convId);
        lastSeenAtRef.current = status.lastMessageAt;
      } catch {}
    };
    seed();

    const interval = setInterval(poll, POLL_INTERVAL_MS);

    // Also check when the app comes back to the foreground
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") poll();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [isStreaming, isTyping]);

  // Auto-retry the pending message once connectivity returns
  useEffect(() => {
    if (isConnected && pendingRetryMessage && !isStreaming && !isTyping) {
      const text = pendingRetryMessage;
      setPendingRetryMessage(null);
      // Remove the "you're offline" placeholder bubble before retrying
      const msgs = useAppStore.getState().messages;
      if (
        msgs.length > 0 &&
        !msgs[msgs.length - 1].isUser &&
        msgs[msgs.length - 1].text.includes("offline")
      ) {
        setMessages(msgs.slice(0, -1));
      }
      handleSend(text);
    }
  }, [isConnected, pendingRetryMessage, isStreaming, isTyping]);

  const handleSend = useCallback(
    async (text: string) => {
      setRateLimitVisible(false);
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
              setLastAIMessageId(data.messageId);
              // Authoritative final text from server — corrects any token-accumulation bugs
              if (data.fullResponse) {
                replaceLastMessage(data.fullResponse);
              }
              setIsStreaming(false);
            },
            onError: (errMsg, status) => {
              if (status === 429) {
                setRateLimitVisible(true);
                if (!streamStarted) {
                  addMessage(
                    "You've reached the rate limit. Please wait a moment and try again.",
                    false,
                  );
                }
              } else if (!streamStarted) {
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
        if (e instanceof OfflineError) {
          // Stash the message so it auto-retries when connectivity returns
          setPendingRetryMessage(text);
          addMessage(
            "You're offline — I'll send this as soon as you're back.",
            false,
          );
        } else if (e instanceof ApiError && e.status === 429) {
          setRateLimitVisible(true);
          setRateLimitReset(e.rateLimitReset);
          addMessage(
            "You've reached the rate limit. Please wait a moment and try again.",
            false,
          );
        } else {
          const errMsg =
            e instanceof Error ? e.message : "Something went wrong";
          addMessage(`Sorry, I couldn't respond right now. ${errMsg}`, false);
        }
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

  const showSuggestions = messages.length <= 5 && !isTyping && !isStreaming;

  if (isHydrating) {
    const userName = useAppStore.getState().user?.name;
    const isReturning = !!activeConversationId;
    const greeting = isReturning ? "Welcome back" : "Welcome";
    const displayName = userName ? `, ${userName}` : "";

    return (
      <View className="flex-1 bg-background">
        <ChatHeader />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-foreground text-2xl font-sans-bold text-center mb-6">
            {greeting}
            {displayName} 👋
          </Text>
          <View className="w-48 h-1 rounded-full bg-surface overflow-hidden">
            <MotiView
              from={{ translateX: -192 }}
              animate={{ translateX: 192 }}
              transition={{
                type: "timing",
                duration: 1200,
                loop: true,
              }}
              className="w-1/2 h-full rounded-full bg-primary"
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ChatHeader />

      <RateLimitBanner
        visible={rateLimitVisible}
        resetTime={rateLimitReset}
        onDismiss={() => setRateLimitVisible(false)}
      />

      <OfflineBanner visible={isConnected === false} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => {
            const isLatest = index === messages.length - 1;
            const showFeedback =
              !item.isUser &&
              !isStreaming &&
              lastAIMessageId !== null &&
              isLatest;

            return (
              <>
                <MessageBubble message={item} isLatest={isLatest} />
                {showFeedback && lastAIMessageId && (
                  <FeedbackRow messageId={lastAIMessageId} />
                )}
              </>
            );
          }}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 8,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            flatListRef.current?.scrollToEnd({ animated: false });
          }}
          ListFooterComponent={isTyping ? <TypingIndicator /> : null}
        />

        <View style={{ paddingBottom: keyboardVisible ? 0 : tabBarHeight }}>
          {showSuggestions && (
            <View style={{ paddingBottom: 8 }}>
              <SuggestionChips onPress={handleSuggestionPress} />
            </View>
          )}
          <ChatInput
            onSend={handleSend}
            disabled={isTyping || isStreaming || isConnected === false}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
