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

interface AppState {
  isOnboarded: boolean;
  user: UserProfile;
  tier: string | null;
  activeConversationId: string | null;
  messages: ChatMessage[];

  completeOnboarding: (user: UserProfile, greeting?: string) => void;
  resetOnboarding: () => void;
  setUser: (partial: Partial<UserProfile>) => void;
  setTier: (tier: string | null) => void;

  addMessage: (text: string, isUser: boolean) => void;
  updateLastMessage: (appendText: string) => void;
  replaceLastMessage: (text: string) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setActiveConversationId: (id: string | null) => void;
}

const INITIAL_USER: UserProfile = {
  name: "",
  allyName: "Ally",
  dailyPingTime: "9:00 AM",
  timezone: "",
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      isOnboarded: false,
      user: INITIAL_USER,
      tier: null,
      activeConversationId: null,
      messages: [],

      completeOnboarding: (user, greeting) => {
        const allyName = user.allyName || "Ally";
        const welcomeText =
          greeting ??
          `Hey ${user.name}! I'm ${allyName} — so glad we've met. I already feel like I know you a little — and I can't wait to learn more. What's on your mind?`;

        const welcomeMessage: ChatMessage = {
          id: `msg-welcome-${Date.now()}`,
          text: welcomeText,
          isUser: false,
          timestamp: new Date(),
        };
        set({
          isOnboarded: true,
          user,
          messages: [welcomeMessage],
          activeConversationId: null,
        });
      },

      resetOnboarding: () => {
        set({
          isOnboarded: false,
          user: INITIAL_USER,
          tier: null,
          messages: [],
          activeConversationId: null,
        });
      },

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
    }),
    {
      name: "ally-app-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
