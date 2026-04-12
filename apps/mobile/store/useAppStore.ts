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
  isOnboarded: boolean;
  /** Guest questions completed (Screens 2-7) — no account yet */
  guestOnboardingComplete: boolean;
  /** User has paid via Stripe */
  hasPaid: boolean;
  /** Guest profile data collected before account creation */
  guestProfile: UserProfile | null;
  /** Anzi's personalized greeting generated during onboarding */
  onboardingGreeting: string | undefined;
  user: UserProfile;
  tier: string | null;
  activeConversationId: string | null;
  messages: ChatMessage[];
  pendingCalendarPrompt: CalendarPromptData | null;

  /** Network connectivity — `null` means unknown (initial state). */
  isConnected: boolean | null;
  /** Message text the user tried to send while offline / that failed due to a network error. */
  pendingRetryMessage: string | null;

  completeOnboarding: (user: UserProfile, greeting?: string) => void;
  completeGuestOnboarding: (profile: UserProfile, greeting?: string) => void;
  setHasPaid: (paid: boolean) => void;
  resetOnboarding: () => void;
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
      isOnboarded: false,
      guestOnboardingComplete: false,
      hasPaid: false,
      guestProfile: null,
      onboardingGreeting: undefined,
      user: INITIAL_USER,
      tier: null,
      activeConversationId: null,
      messages: [],
      pendingCalendarPrompt: null,
      isConnected: null,
      pendingRetryMessage: null,

      completeOnboarding: (user, greeting) => {
        const allyName = user.allyName || "Anzi";
        const welcomeText =
          greeting ??
          `Thanks for sharing that with me, ${user.name}. I'm really glad you're here.\n\nBefore we get started — tell me one thing you don't want to forget this week.`;

        const welcomeMessage: ChatMessage = {
          id: `msg-welcome-${Date.now()}`,
          text: welcomeText,
          isUser: false,
          timestamp: new Date(),
        };
        set({
          isOnboarded: true,
          guestOnboardingComplete: true,
          hasPaid: true,
          user,
          guestProfile: null,
          messages: [welcomeMessage],
          activeConversationId: null,
        });
      },

      /** Called after guest questions done — saves profile, does NOT mark fully onboarded yet */
      completeGuestOnboarding: (profile, greeting) => {
        set({
          guestOnboardingComplete: true,
          guestProfile: profile,
          onboardingGreeting: greeting,
        });
      },

      setHasPaid: (paid) => {
        set({ hasPaid: paid });
      },

      resetOnboarding: () => {
        set({
          isOnboarded: false,
          guestOnboardingComplete: false,
          hasPaid: false,
          guestProfile: null,
          onboardingGreeting: undefined,
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
    }),
    {
      name: "ally-app-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => {
        // Exclude transient runtime state from persistence
        const { isConnected, ...persisted } = state;
        return persisted;
      },
    },
  ),
);

/**
 * Explicitly remove the persisted Zustand store from AsyncStorage.
 * Call this on sign-out to guarantee no stale data survives across accounts.
 * The in-memory Zustand state should also be reset via `resetOnboarding()`.
 */
export async function clearPersistedStorage() {
  await AsyncStorage.removeItem("ally-app-storage");
}
