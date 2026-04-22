import { create } from "zustand";

interface SettingsSheetState {
  visible: boolean;
  present: () => void;
  dismiss: () => void;
}

export const useSettingsSheet = create<SettingsSheetState>((set) => ({
  visible: false,
  present: () => set({ visible: true }),
  dismiss: () => set({ visible: false }),
}));
