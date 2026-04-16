import React, { useEffect, useCallback, useMemo, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Share,
  Alert,
  Modal,
  Pressable,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../store/useAppStore";
import { useFamilyStore } from "../../store/useFamilyStore";
import {
  getFamilyDashboard,
  getTasks,
  getShoppingLists,
  toggleShoppingItem as apiToggleItem,
  updateTask as apiUpdateTask,
  createInviteLink,
  addFamilyMember,
} from "../../lib/api";
import { useTheme } from "../../context/ThemeContext";
import type { Task, CalendarEvent, ShoppingListItem } from "@ally/shared";

// ---------- Helper Components ----------

function SectionHeader({
  title,
  icon,
  count,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  count?: number;
}) {
  const { theme } = useTheme();
  return (
    <View className="flex-row items-center mb-3 mt-6">
      <Ionicons name={icon} size={20} color={theme.colors["--color-primary"]} />
      <Text className="text-foreground text-lg font-sans-bold ml-2">
        {title}
      </Text>
      {count !== undefined && count > 0 && (
        <View className="bg-primary/20 rounded-full px-2 py-0.5 ml-2">
          <Text className="text-primary text-xs font-sans-bold">{count}</Text>
        </View>
      )}
    </View>
  );
}

function MemberChip({
  name,
  color,
}: {
  name: string;
  color?: string;
}) {
  return (
    <View
      className="rounded-full px-3 py-1.5 mr-2 mb-2"
      style={{ backgroundColor: (color ?? "#6366F1") + "20" }}
    >
      <Text style={{ color: color ?? "#6366F1" }} className="text-sm font-sans-semibold">
        {name}
      </Text>
    </View>
  );
}

function EventCard({ event }: { event: CalendarEvent }) {
  const { theme } = useTheme();
  const startTime = new Date(event.startTime).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const assignedNames = (event as any).assignedNames as string[] | undefined;

  return (
    <View className="bg-surface rounded-2xl p-4 mb-2 border border-border/30">
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-foreground text-base font-sans-semibold">
            {event.title}
          </Text>
          <Text className="text-muted text-sm font-sans mt-1">
            {event.allDay ? "All day" : startTime}
            {event.location ? ` · ${event.location}` : ""}
          </Text>
        </View>
        {event.color && (
          <View
            className="w-3 h-3 rounded-full mt-1"
            style={{ backgroundColor: event.color }}
          />
        )}
      </View>
      {assignedNames && assignedNames.length > 0 && (
        <View className="flex-row flex-wrap mt-2">
          {assignedNames.map((name, i) => (
            <Text key={i} className="text-muted text-xs font-sans mr-2">
              {name}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function TaskRow({
  task,
  onToggle,
}: {
  task: Task & { assignedToName?: string | null };
  onToggle: (taskId: string) => void;
}) {
  const { theme } = useTheme();
  const isCompleted = task.status === "completed";
  const dueText = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <TouchableOpacity
      className="flex-row items-center bg-surface rounded-xl p-3 mb-2 border border-border/30"
      onPress={() => onToggle(task.id)}
      activeOpacity={0.7}
    >
      <Ionicons
        name={isCompleted ? "checkmark-circle" : "ellipse-outline"}
        size={22}
        color={
          isCompleted
            ? theme.colors["--color-success"] ?? "#059669"
            : theme.colors["--color-muted"]
        }
      />
      <View className="flex-1 ml-3">
        <Text
          className={`text-sm font-sans-semibold ${isCompleted ? "text-muted line-through" : "text-foreground"}`}
        >
          {task.title}
        </Text>
        {(task.assignedToName || dueText) && (
          <Text className="text-muted text-xs font-sans mt-0.5">
            {[task.assignedToName, dueText].filter(Boolean).join(" · ")}
          </Text>
        )}
      </View>
      {task.priority === "high" && (
        <Ionicons
          name="alert-circle"
          size={16}
          color={theme.colors["--color-error"] ?? "#DC2626"}
        />
      )}
    </TouchableOpacity>
  );
}

function ShoppingSection({
  lists,
  onToggleItem,
}: {
  lists: { id: string; name: string; items: ShoppingListItem[] }[];
  onToggleItem: (itemId: string) => void;
}) {
  const { theme } = useTheme();
  if (lists.length === 0) return null;

  // Show the first list by default (usually "Groceries")
  const list = lists[0];
  const unchecked = list.items.filter((i) => !i.checked);
  const checked = list.items.filter((i) => i.checked);

  return (
    <View>
      {unchecked.map((item) => (
        <TouchableOpacity
          key={item.id}
          className="flex-row items-center py-2.5 px-1"
          onPress={() => onToggleItem(item.id)}
          activeOpacity={0.7}
        >
          <Ionicons
            name="square-outline"
            size={20}
            color={theme.colors["--color-muted"]}
          />
          <Text className="text-foreground text-sm font-sans ml-3 flex-1">
            {item.name}
          </Text>
          {item.quantity && (
            <Text className="text-muted text-xs font-sans">{item.quantity}</Text>
          )}
        </TouchableOpacity>
      ))}
      {checked.length > 0 && (
        <View className="mt-2 opacity-50">
          <Text className="text-muted text-xs font-sans-bold mb-1">
            Checked off ({checked.length})
          </Text>
          {checked.slice(0, 3).map((item) => (
            <TouchableOpacity
              key={item.id}
              className="flex-row items-center py-1.5 px-1"
              onPress={() => onToggleItem(item.id)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="checkbox"
                size={20}
                color={theme.colors["--color-muted"]}
              />
              <Text className="text-muted text-sm font-sans ml-3 line-through">
                {item.name}
              </Text>
            </TouchableOpacity>
          ))}
          {checked.length > 3 && (
            <Text className="text-muted text-xs font-sans ml-8">
              +{checked.length - 3} more
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ---------- Add Member Modal ----------

const MEMBER_COLORS = [
  "#4F46E5", "#059669", "#D97706", "#DC2626", "#7C3AED",
  "#DB2777", "#0891B2", "#65A30D", "#EA580C", "#6366F1",
];

function AddMemberModal({
  visible,
  onClose,
  onAdded,
  existingCount,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
  existingCount: number;
}) {
  const { theme } = useTheme();
  const [name, setName] = useState("");
  const [role, setRole] = useState<"parent" | "child" | "other">("child");
  const [age, setAge] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await addFamilyMember({
        name: name.trim(),
        role,
        age: age.trim() ? parseInt(age.trim(), 10) : undefined,
        color: MEMBER_COLORS[existingCount % MEMBER_COLORS.length],
      });
      setName("");
      setAge("");
      setRole("child");
      onAdded();
      onClose();
    } catch {
      Alert.alert("Error", "Could not add family member. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const roles: { label: string; value: "parent" | "child" | "other" }[] = [
    { label: "Partner", value: "parent" },
    { label: "Child", value: "child" },
    { label: "Other", value: "other" },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <Pressable
          className="flex-1 bg-black/40 justify-end"
          onPress={onClose}
        >
          <Pressable onPress={() => {}}>
            <View
              className="rounded-t-3xl px-5 pt-5 pb-8"
              style={{ backgroundColor: theme.colors["--color-surface"] }}
            >
              <Text className="text-foreground text-lg font-sans-semibold mb-4">
                Add Family Member
              </Text>

              <RNTextInput
                value={name}
                onChangeText={setName}
                placeholder="Name"
                placeholderTextColor={theme.colors["--color-muted"]}
                className="text-foreground text-base font-sans mb-3 bg-background rounded-xl px-4 py-3"
                style={{ color: theme.colors["--color-foreground"] }}
                autoFocus
              />

              <View className="flex-row gap-2 mb-3">
                {roles.map((r) => (
                  <Pressable
                    key={r.value}
                    onPress={() => setRole(r.value)}
                    className={`flex-1 py-2.5 rounded-xl items-center ${
                      role === r.value ? "bg-primary" : "bg-background"
                    }`}
                  >
                    <Text
                      className={`text-sm font-sans-semibold ${
                        role === r.value ? "text-white" : "text-foreground"
                      }`}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {role === "child" && (
                <RNTextInput
                  value={age}
                  onChangeText={setAge}
                  placeholder="Age (optional)"
                  placeholderTextColor={theme.colors["--color-muted"]}
                  keyboardType="number-pad"
                  className="text-foreground text-base font-sans mb-3 bg-background rounded-xl px-4 py-3"
                  style={{ color: theme.colors["--color-foreground"] }}
                />
              )}

              <View className="flex-row gap-3 mt-1">
                <Pressable
                  onPress={onClose}
                  className="flex-1 py-3.5 rounded-2xl bg-primary-soft items-center active:opacity-70"
                >
                  <Text className="text-primary font-sans-semibold">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={!name.trim() || saving}
                  className={`flex-1 py-3.5 rounded-2xl items-center active:opacity-70 ${
                    !name.trim() || saving ? "bg-primary/50" : "bg-primary"
                  }`}
                >
                  <Text className="text-white font-sans-semibold">
                    {saving ? "Adding..." : "Add"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------- Main Screen ----------

export default function FamilyDashboardScreen() {
  const user = useAppStore((s) => s.user);
  const {
    dashboard,
    dashboardLoading,
    setDashboard,
    setDashboardLoading,
    setTasks,
    tasks,
    setShoppingLists,
    shoppingLists,
    toggleItem,
    members,
    family,
  } = useFamilyStore();
  const { theme } = useTheme();

  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setDashboardLoading(true);
      }
      setError(null);

      try {
        const [dashData, taskData, shopData] = await Promise.all([
          getFamilyDashboard().catch(() => null),
          getTasks().catch(() => ({ tasks: [] })),
          getShoppingLists().catch(() => ({ lists: [] })),
        ]);

        if (dashData) {
          setDashboard(dashData);
        }
        setTasks(taskData.tasks);
        setShoppingLists(shopData.lists);
      } catch {
        setError("Couldn't load family data. Pull down to try again.");
      } finally {
        setDashboardLoading(false);
        setRefreshing(false);
      }
    },
    [setDashboard, setDashboardLoading, setTasks, setShoppingLists],
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleTask = useCallback(
    async (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const newStatus = task.status === "completed" ? "pending" : "completed";
      try {
        const { task: updated } = await apiUpdateTask(taskId, { status: newStatus });
        useFamilyStore.getState().updateTask(taskId, updated);
      } catch {
        // revert optimistic if needed
      }
    },
    [tasks],
  );

  const handleToggleShoppingItem = useCallback(async (itemId: string) => {
    // Optimistic update
    toggleItem(itemId);
    try {
      await apiToggleItem(itemId);
    } catch {
      // revert
      toggleItem(itemId);
    }
  }, [toggleItem]);

  const todayEvents = useMemo(() => {
    if (!dashboard?.todayEvents) return [];
    return dashboard.todayEvents;
  }, [dashboard]);

  const pendingTasks = useMemo(() => {
    return tasks.filter((t) => t.status !== "completed").slice(0, 8);
  }, [tasks]);

  const [addMemberVisible, setAddMemberVisible] = useState(false);

  const familyName = family?.name ?? dashboard?.family?.name ?? `${user.name}'s Family`;

  const handleInvite = useCallback(async () => {
    try {
      const { inviteLink } = await createInviteLink({
        email: "invite@placeholder.com",
        role: "member",
      });
      await Share.share({
        message: `Join our family on Anzi! ${inviteLink}`,
        title: "Join our family on Anzi",
      });
    } catch (e) {
      if (e instanceof Error && e.message !== "User did not share") {
        Alert.alert("Error", "Could not create invite link. Please try again.");
      }
    }
  }, []);

  if (dashboardLoading && !dashboard) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" className="text-primary" />
      </View>
    );
  }

  if (error && !dashboard) {
    return (
      <View className="flex-1 bg-background">
        <SafeAreaView edges={["top"]} className="flex-1">
          <View className="flex-1 px-5 pt-4 items-center justify-center">
            <Ionicons
              name="people-outline"
              size={48}
              color={theme.colors["--color-muted"]}
            />
            <Text className="text-muted text-sm font-sans text-center mt-3">
              {error}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top"]} className="flex-1">
        <ScrollView
          className="flex-1 px-5 pt-2"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
            />
          }
        >
          <MotiView
            from={{ opacity: 0, translateY: 12 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 400 }}
          >
            {/* Header */}
            <View className="mb-2 mt-2">
              <Text className="text-foreground text-2xl font-sans-bold">
                {familyName}
              </Text>
              <Text className="text-muted text-sm font-sans mt-1">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
            </View>

            {/* Family Members */}
            <View className="flex-row flex-wrap mt-3">
              {(dashboard?.members ?? members).map((m) => (
                <MemberChip key={m.id} name={m.name} color={m.color ?? undefined} />
              ))}
              <TouchableOpacity
                onPress={() => setAddMemberVisible(true)}
                className="rounded-full px-3 py-1.5 mr-2 mb-2 border border-dashed border-primary/50 flex-row items-center"
                activeOpacity={0.7}
              >
                <Ionicons
                  name="person-add-outline"
                  size={14}
                  color={theme.colors["--color-primary"]}
                />
                <Text className="text-primary text-sm font-sans-semibold ml-1">
                  Add
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleInvite}
                className="rounded-full px-3 py-1.5 mr-2 mb-2 border border-dashed border-primary/50 flex-row items-center"
                activeOpacity={0.7}
              >
                <Ionicons
                  name="share-outline"
                  size={14}
                  color={theme.colors["--color-primary"]}
                />
                <Text className="text-primary text-sm font-sans-semibold ml-1">
                  Invite
                </Text>
              </TouchableOpacity>
            </View>

            {/* Today's Schedule */}
            <SectionHeader
              title="Today's Schedule"
              icon="calendar-outline"
              count={todayEvents.length}
            />
            {todayEvents.length > 0 ? (
              todayEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))
            ) : (
              <View className="bg-surface/50 rounded-2xl p-6 items-center">
                <Ionicons
                  name="sunny-outline"
                  size={32}
                  color={theme.colors["--color-muted"]}
                />
                <Text className="text-muted text-sm font-sans mt-2 text-center">
                  Nothing scheduled today — enjoy the free time!
                </Text>
              </View>
            )}

            {/* Tasks */}
            <SectionHeader
              title="To Do"
              icon="checkbox-outline"
              count={pendingTasks.length}
            />
            {pendingTasks.length > 0 ? (
              pendingTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggleTask}
                />
              ))
            ) : (
              <View className="bg-surface/50 rounded-2xl p-6 items-center">
                <Ionicons
                  name="checkmark-done-outline"
                  size={32}
                  color={theme.colors["--color-muted"]}
                />
                <Text className="text-muted text-sm font-sans mt-2 text-center">
                  All caught up! 🎉
                </Text>
              </View>
            )}

            {/* Shopping List */}
            <SectionHeader
              title="Shopping List"
              icon="cart-outline"
              count={
                shoppingLists[0]?.items.filter((i) => !i.checked).length ?? 0
              }
            />
            {shoppingLists.length > 0 &&
            shoppingLists[0].items.length > 0 ? (
              <View className="bg-surface rounded-2xl p-4 border border-border/30">
                <ShoppingSection
                  lists={shoppingLists}
                  onToggleItem={handleToggleShoppingItem}
                />
              </View>
            ) : (
              <View className="bg-surface/50 rounded-2xl p-6 items-center">
                <Ionicons
                  name="bag-check-outline"
                  size={32}
                  color={theme.colors["--color-muted"]}
                />
                <Text className="text-muted text-sm font-sans mt-2 text-center">
                  Shopping list is empty — tell Anzi what you need!
                </Text>
              </View>
            )}

            {/* Spacer for tab bar */}
            <View className="h-8" />
          </MotiView>
        </ScrollView>
      </SafeAreaView>

      <AddMemberModal
        visible={addMemberVisible}
        onClose={() => setAddMemberVisible(false)}
        onAdded={() => load(true)}
        existingCount={(dashboard?.members ?? members).length}
      />
    </View>
  );
}
