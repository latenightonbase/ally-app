import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Message, Memory, createInitialMemories } from "../constants/mockData";

export interface UserProfile {
  name: string;
  allyName: string;
  job: string;
  challenges: string;
  interests: string[];
  briefingTime: string;
}

interface AppState {
  // Onboarding
  isOnboarded: boolean;
  user: UserProfile;

  // Chat
  messages: Message[];

  // Memory
  memories: Memory[];

  // Actions
  completeOnboarding: (user: UserProfile) => void;
  resetOnboarding: () => void;

  addMessage: (text: string, isUser: boolean) => void;

  addMemory: (category: Memory["category"], text: string) => void;
  editMemory: (id: string, text: string) => void;
  removeMemory: (id: string) => void;
}

const INITIAL_USER: UserProfile = {
  name: "",
  allyName: "Ally",
  job: "",
  challenges: "",
  interests: [],
  briefingTime: "9:00 AM",
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      isOnboarded: false,
      user: INITIAL_USER,
      messages: [],
      memories: [],

      completeOnboarding: (user) => {
        const memories = createInitialMemories(user);
        const welcomeMessage: Message = {
          id: `msg-welcome-${Date.now()}`,
          text: `Hey ${user.name}! I'm ${user.allyName} — so glad we've met. I already feel like I know you a little — and I can't wait to learn more. What's on your mind?`,
          isUser: false,
          timestamp: new Date(),
        };
        set({
          isOnboarded: true,
          user,
          memories,
          messages: [welcomeMessage],
        });
      },

      resetOnboarding: () => {
        set({
          isOnboarded: false,
          user: INITIAL_USER,
          messages: [],
          memories: [],
        });
      },

      addMessage: (text, isUser) => {
        const message: Message = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          text,
          isUser,
          timestamp: new Date(),
        };
        set((state) => ({
          messages: [...state.messages, message],
        }));
      },

      addMemory: (category, text) => {
        const memory: Memory = {
          id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          category,
          text,
          createdAt: new Date(),
        };
        set((state) => ({
          memories: [...state.memories, memory],
        }));
      },

      editMemory: (id, text) => {
        set((state) => ({
          memories: state.memories.map((m) =>
            m.id === id ? { ...m, text } : m
          ),
        }));
      },

      removeMemory: (id) => {
        set((state) => ({
          memories: state.memories.filter((m) => m.id !== id),
        }));
      },
    }),
    {
      name: "ally-app-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
