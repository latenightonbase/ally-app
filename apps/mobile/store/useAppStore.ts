import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface UserProfile {
  name: string;
  allyName: string;
  dailyPingTime: string;
  timezone: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

export interface CalendarPromptData {
  reminderId: string;
  title: string;
  startDate: string; // ISO string
  body?: string;
  timezone?: string;
  durationMinutes: number;
}

interface AppState {
  user: UserProfile;
  tier: string | null;
  activeConversationId: string | null;
  messages: ChatMessage[];
  pendingCalendarPrompt: CalendarPromptData | null;

  /** Network connectivity — `null` means unknown (initial state). */
  isConnected: boolean | null;
  /** Message text the user tried to send while offline / that failed due to a network error. */
  pendingRetryMessage: string | null;

  setUser: (partial: Partial<UserProfile>) => void;
  setTier: (tier: string | null) => void;

  addMessage: (text: string, isUser: boolean) => void;
  updateLastMessage: (appendText: string) => void;
  replaceLastMessage: (text: string) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setActiveConversationId: (id: string | null) => void;
  setPendingCalendarPrompt: (data: CalendarPromptData) => void;
  clearPendingCalendarPrompt: () => void;

  setIsConnected: (connected: boolean) => void;
  setPendingRetryMessage: (text: string | null) => void;

  reset: () => void;
}

const INITIAL_USER: UserProfile = {
  name: "",
  allyName: "Anzi",
  dailyPingTime: "9:00 AM",
  timezone: "",
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: INITIAL_USER,
      tier: null,
      activeConversationId: null,
      messages: [],
      pendingCalendarPrompt: null,
      isConnected: null,
      pendingRetryMessage: null,

      setUser: (partial) => {
        set((state) => ({ user: { ...state.user, ...partial } }));
      },

      setTier: (tier) => {
        set({ tier });
      },

      addMessage: (text, isUser) => {
        const message: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          text,
          isUser,
          timestamp: new Date(),
        };
        set((state) => ({
          messages: [...state.messages, message],
        }));
      },

      updateLastMessage: (appendText) => {
        set((state) => {
          const msgs = [...state.messages];
          if (msgs.length === 0) return state;
          const last = msgs[msgs.length - 1];
          msgs[msgs.length - 1] = { ...last, text: last.text + appendText };
          return { messages: msgs };
        });
      },

      replaceLastMessage: (text) => {
        set((state) => {
          const msgs = [...state.messages];
          if (msgs.length === 0) return state;
          const last = msgs[msgs.length - 1];
          if (last.isUser) return state;
          msgs[msgs.length - 1] = { ...last, text };
          return { messages: msgs };
        });
      },

      setMessages: (messages) => {
        set({ messages });
      },

      setActiveConversationId: (id) => {
        set({ activeConversationId: id });
      },

      setPendingCalendarPrompt: (data) => {
        set({ pendingCalendarPrompt: data });
      },

      clearPendingCalendarPrompt: () => {
        set({ pendingCalendarPrompt: null });
      },

      setIsConnected: (connected) => {
        set({ isConnected: connected });
      },

      setPendingRetryMessage: (text) => {
        set({ pendingRetryMessage: text });
      },

      reset: () => {
        set({
          user: INITIAL_USER,
          tier: null,
          messages: [],
          activeConversationId: null,
          pendingCalendarPrompt: null,
          pendingRetryMessage: null,
        });
      },
    }),
    {
      name: "anzi-app-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => {
        const { isConnected, ...persisted } = state;
        return persisted;
      },
    },
  ),
);

/**
 * Explicitly remove the persisted Zustand store from AsyncStorage.
 * Call this on sign-out to guarantee no stale data survives across accounts.
 */
export async function clearPersistedStorage() {
  await AsyncStorage.removeItem("anzi-app-storage");
}
