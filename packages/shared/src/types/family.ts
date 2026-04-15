// ─── Family domain types ─────────────────────────────────────────

export interface Family {
  id: string;
  name: string;
  createdBy: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyMember {
  id: string;
  familyId: string;
  userId: string | null;
  name: string;
  role: "parent" | "child" | "other";
  age: number | null;
  birthday: string | null;
  school: string | null;
  allergies: string[];
  dietaryPreferences: string[];
  notes: string | null;
  color: string;
  expoPushToken: string | null;
  createdAt: string;
}

export interface FamilyInvite {
  id: string;
  familyId: string;
  invitedBy: string;
  email: string;
  role: "admin" | "member";
  status: "pending" | "accepted" | "declined" | "expired";
  token: string;
  expiresAt: string;
  createdAt: string;
}

// ─── Calendar ────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  familyId: string;
  createdBy: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  recurrence: TaskRecurrence;
  assignedTo: string[]; // family member IDs
  remindBefore: number; // minutes
  color: string | null;
  sourceConversationId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCalendarEventInput {
  familyId: string;
  title: string;
  description?: string;
  startTime: string | Date;
  endTime?: string | Date;
  allDay?: boolean;
  location?: string;
  recurrence?: TaskRecurrence;
  assignedTo?: string[];
  remindBefore?: number;
  color?: string;
  sourceConversationId?: string;
}

// ─── Tasks / Chores ──────────────────────────────────────────────

export type TaskStatus = "pending" | "in_progress" | "completed" | "skipped";
export type TaskRecurrence = "none" | "daily" | "weekly" | "biweekly" | "monthly";
export type TaskPriority = "high" | "medium" | "low";
export type TaskCategory = "chore" | "errand" | "school" | "health" | "other";

export interface Task {
  id: string;
  familyId: string;
  createdBy: string;
  title: string;
  description: string | null;
  assignedTo: string | null; // family member ID
  dueDate: string | null;
  status: TaskStatus;
  recurrence: TaskRecurrence;
  priority: TaskPriority;
  category: TaskCategory | null;
  sourceConversationId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  familyId: string;
  title: string;
  description?: string;
  assignedTo?: string;
  dueDate?: string | Date;
  recurrence?: TaskRecurrence;
  priority?: TaskPriority;
  category?: TaskCategory;
  sourceConversationId?: string;
}

// ─── Shopping Lists ──────────────────────────────────────────────

export type GroceryCategory =
  | "produce"
  | "dairy"
  | "meat"
  | "pantry"
  | "frozen"
  | "household"
  | "other";

export interface ShoppingList {
  id: string;
  familyId: string;
  name: string;
  createdBy: string;
  items: ShoppingListItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingListItem {
  id: string;
  listId: string;
  name: string;
  quantity: string | null;
  category: GroceryCategory | null;
  checked: boolean;
  addedBy: string | null;
  sourceConversationId: string | null;
  createdAt: string;
}

export interface AddShoppingItemInput {
  listId: string;
  name: string;
  quantity?: string;
  category?: GroceryCategory;
}

// ─── Meal Planning ───────────────────────────────────────────────

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface MealPlan {
  id: string;
  familyId: string;
  date: string;
  mealType: MealType;
  title: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

// ─── Family API request/response types ───────────────────────────

export interface CreateFamilyRequest {
  name: string;
  timezone?: string;
  members?: {
    name: string;
    role: "parent" | "child" | "other";
    age?: number;
    birthday?: string;
  }[];
}

export interface InviteFamilyMemberRequest {
  email: string;
  role?: "admin" | "member";
}

export interface FamilyDashboard {
  family: Family;
  members: FamilyMember[];
  todayEvents: CalendarEvent[];
  pendingTasks: Task[];
  activeShoppingLists: ShoppingList[];
  todayMeals: MealPlan[];
}
