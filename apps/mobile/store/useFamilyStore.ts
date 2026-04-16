import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

const FAMILY_STORAGE_KEY = "anzi-family-storage";
import type {
  Family,
  FamilyMember,
  CalendarEvent,
  Task,
  ShoppingList,
  ShoppingListItem,
  FamilyDashboard,
} from "@ally/shared";

interface FamilyState {
  // --- Family core ---
  family: Family | null;
  members: FamilyMember[];
  isLoading: boolean;

  // --- Calendar ---
  events: CalendarEvent[];
  selectedDate: string; // ISO date string (YYYY-MM-DD)

  // --- Tasks ---
  tasks: Task[];
  taskFilter: "all" | "pending" | "in_progress" | "completed";

  // --- Shopping ---
  shoppingLists: (ShoppingList & { items: ShoppingListItem[] })[];

  // --- Dashboard ---
  dashboard: FamilyDashboard | null;
  dashboardLoading: boolean;

  // --- Actions ---
  setFamily: (family: Family, members: FamilyMember[]) => void;
  setMembers: (members: FamilyMember[]) => void;
  addMember: (member: FamilyMember) => void;
  setIsLoading: (loading: boolean) => void;

  setEvents: (events: CalendarEvent[]) => void;
  addEvent: (event: CalendarEvent) => void;
  updateEvent: (eventId: string, event: CalendarEvent) => void;
  removeEvent: (eventId: string) => void;
  setSelectedDate: (date: string) => void;

  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (taskId: string, task: Task) => void;
  removeTask: (taskId: string) => void;
  setTaskFilter: (filter: "all" | "pending" | "in_progress" | "completed") => void;

  setShoppingLists: (lists: (ShoppingList & { items: ShoppingListItem[] })[]) => void;
  toggleItem: (itemId: string) => void;
  removeItem: (itemId: string) => void;
  addItems: (listId: string, items: ShoppingListItem[]) => void;

  setDashboard: (dashboard: FamilyDashboard) => void;
  setDashboardLoading: (loading: boolean) => void;

  reset: () => void;
}

const today = () => new Date().toISOString().split("T")[0];

export const useFamilyStore = create<FamilyState>()(
  persist(
    (set, get) => ({
      family: null,
      members: [],
      isLoading: false,

      events: [],
      selectedDate: today(),

      tasks: [],
      taskFilter: "all",

      shoppingLists: [],

      dashboard: null,
      dashboardLoading: false,

      setFamily: (family, members) => set({ family, members }),
      setMembers: (members) => set({ members }),
      addMember: (member) =>
        set((state) => ({ members: [...state.members, member] })),
      setIsLoading: (loading) => set({ isLoading: loading }),

      setEvents: (events) => set({ events }),
      addEvent: (event) =>
        set((state) => ({ events: [...state.events, event] })),
      updateEvent: (eventId, event) =>
        set((state) => ({
          events: state.events.map((e) => (e.id === eventId ? event : e)),
        })),
      removeEvent: (eventId) =>
        set((state) => ({
          events: state.events.filter((e) => e.id !== eventId),
        })),
      setSelectedDate: (date) => set({ selectedDate: date }),

      setTasks: (tasks) => set({ tasks }),
      addTask: (task) =>
        set((state) => ({ tasks: [...state.tasks, task] })),
      updateTask: (taskId, task) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === taskId ? task : t)),
        })),
      removeTask: (taskId) =>
        set((state) => ({
          tasks: state.tasks.filter((t) => t.id !== taskId),
        })),
      setTaskFilter: (filter) => set({ taskFilter: filter }),

      setShoppingLists: (lists) => set({ shoppingLists: lists }),
      toggleItem: (itemId) =>
        set((state) => ({
          shoppingLists: state.shoppingLists.map((list) => ({
            ...list,
            items: list.items.map((item) =>
              item.id === itemId ? { ...item, checked: !item.checked } : item,
            ),
          })),
        })),
      removeItem: (itemId) =>
        set((state) => ({
          shoppingLists: state.shoppingLists.map((list) => ({
            ...list,
            items: list.items.filter((item) => item.id !== itemId),
          })),
        })),
      addItems: (listId, items) =>
        set((state) => ({
          shoppingLists: state.shoppingLists.map((list) =>
            list.id === listId
              ? { ...list, items: [...list.items, ...items] }
              : list,
          ),
        })),

      setDashboard: (dashboard) => set({ dashboard, dashboardLoading: false }),
      setDashboardLoading: (loading) => set({ dashboardLoading: loading }),

      reset: () =>
        set({
          family: null,
          members: [],
          isLoading: false,
          events: [],
          selectedDate: today(),
          tasks: [],
          taskFilter: "all",
          shoppingLists: [],
          dashboard: null,
          dashboardLoading: false,
        }),
    }),
    {
      name: FAMILY_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        family: state.family,
        members: state.members,
        selectedDate: state.selectedDate,
        taskFilter: state.taskFilter,
      }),
    },
  ),
);

export async function clearFamilyPersistedStorage() {
  await AsyncStorage.removeItem(FAMILY_STORAGE_KEY);
}
