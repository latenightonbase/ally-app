import { create } from "zustand";

interface FamilyMemberOnboarding {
  name: string;
  role: "parent" | "child" | "other";
  age?: number;
}

interface OnboardingState {
  familyMembers: FamilyMemberOnboarding[];
  challenges: string[];
  dailyPingTime: string;
  magicMoment: string;

  setFamilyMembers: (members: FamilyMemberOnboarding[]) => void;
  setChallenges: (challenges: string[]) => void;
  setDailyPingTime: (time: string) => void;
  setMagicMoment: (text: string) => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>()((set) => ({
  familyMembers: [],
  challenges: [],
  dailyPingTime: "07:30",
  magicMoment: "",

  setFamilyMembers: (members) => set({ familyMembers: members }),
  setChallenges: (challenges) => set({ challenges }),
  setDailyPingTime: (time) => set({ dailyPingTime: time }),
  setMagicMoment: (text) => set({ magicMoment: text }),
  reset: () =>
    set({
      familyMembers: [],
      challenges: [],
      dailyPingTime: "07:30",
      magicMoment: "",
    }),
}));
