import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface UserProfile {
  name: string;
  allyName: string;
  job: string;
  challenges: string;
  interests: string[];
  briefingTime: string;
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
  activeConversationId: string | null;
  messages: ChatMessage[];

  completeOnboarding: (user: UserProfile) => void;
  resetOnboarding: () => void;

  addMessage: (text: string, isUser: boolean) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setActiveConversationId: (id: string | null) => void;
}

const INITIAL_USER: UserProfile = {
  name: "",
  allyName: "Ally",
  job: "",
  challenges: "",
  interests: [],
  briefingTime: "9:00 AM",
  dailyPingTime: "9:00 AM",
  timezone: "",
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isOnboarded: false,
      user: INITIAL_USER,
      activeConversationId: null,
      messages: [],

      completeOnboarding: (user) => {
        const welcomeMessage: ChatMessage = {
          id: `msg-welcome-${Date.now()}`,
          text: `Hey ${user.name}! I'm ${user.allyName} — so glad we've met. I already feel like I know you a little — and I can't wait to learn more. What's on your mind?`,
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
          messages: [],
          activeConversationId: null,
        });
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
