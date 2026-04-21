import React, { useEffect, useCallback, useMemo, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { useFamilyStore } from "../../store/useFamilyStore";
import {
  getFamilyDashboard,
  getTasks,
  getShoppingLists,
  toggleShoppingItem as apiToggleItem,
  updateTask as apiUpdateTask,
} from "../../lib/api";
import { useTheme } from "../../context/ThemeContext";
import type { Task, ShoppingListItem } from "@ally/shared";

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
        <View className="bg-primary-soft rounded-full px-2 py-0.5 ml-2">
          <Text className="text-primary text-xs font-sans-bold">{count}</Text>
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
      className="flex-row items-center bg-surface rounded-xl p-3 mb-2 border border-primary-soft"
      onPress={() => onToggle(task.id)}
      activeOpacity={0.7}
    >
      <Ionicons
        name={isCompleted ? "checkmark-circle" : "ellipse-outline"}
        size={22}
        color={
          isCompleted
            ? ((theme.colors as any)["--color-success"] ?? "#059669")
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
          color={(theme.colors as any)["--color-danger"] ?? "#DC2626"}
        />
      )}
    </TouchableOpacity>
  );
}

function CompletedTaskRow({
  task,
  onUnmark,
}: {
  task: Task & { assignedToName?: string | null; completedByName?: string | null };
  onUnmark: (taskId: string) => void;
}) {
  const { theme } = useTheme();
  const completedTime = task.completedAt
    ? new Date(task.completedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const completedBy = task.completedByName ?? task.assignedToName ?? null;

  return (
    <View className="flex-row items-center bg-surface/60 rounded-xl p-3 mb-2 border border-primary-soft">
      <Ionicons
        name="checkmark-circle"
        size={22}
        color={(theme.colors as any)["--color-success"] ?? "#059669"}
      />
      <View className="flex-1 ml-3">
        <Text className="text-muted text-sm font-sans-semibold line-through">
          {task.title}
        </Text>
        <Text className="text-muted text-xs font-sans mt-0.5">
          {[completedBy ? `by ${completedBy}` : null, completedTime]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => onUnmark(task.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        className="ml-2 px-2 py-1 rounded-lg bg-primary-soft"
      >
        <Text className="text-primary text-xs font-sans-semibold">Undo</Text>
      </TouchableOpacity>
    </View>
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

// ---------- Main Screen ----------

export default function ListsScreen() {
  const {
    dashboard,
    setDashboard,
    setDashboardLoading,
    dashboardLoading,
    setTasks,
    tasks,
    setShoppingLists,
    shoppingLists,
    toggleItem,
    family,
  } = useFamilyStore();
  const { theme } = useTheme();

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const hasFamily = !!family || !!dashboard;

  const load = useCallback(
    async (isRefresh = false) => {
      if (!hasFamily) {
        return;
      }
      if (isRefresh) setRefreshing(true);
      else setDashboardLoading(true);
      setError(null);

      try {
        const [dashData, taskData, shopData] = await Promise.all([
          getFamilyDashboard().catch(() => null),
          getTasks().catch(() => ({ tasks: [] })),
          getShoppingLists().catch(() => ({ lists: [] })),
        ]);

        if (dashData) setDashboard(dashData);
        setTasks(taskData.tasks);
        setShoppingLists(shopData.lists);
      } catch {
        setError("Couldn't load lists. Pull down to try again.");
      } finally {
        setDashboardLoading(false);
        setRefreshing(false);
      }
    },
    [hasFamily, setDashboard, setDashboardLoading, setTasks, setShoppingLists],
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
        const { task: updated } = await apiUpdateTask(taskId, {
          status: newStatus,
        });
        useFamilyStore.getState().updateTask(taskId, updated);
      } catch {
        // ignore
      }
    },
    [tasks],
  );

  const handleToggleShoppingItem = useCallback(
    async (itemId: string) => {
      toggleItem(itemId);
      try {
        await apiToggleItem(itemId);
      } catch {
        toggleItem(itemId);
      }
    },
    [toggleItem],
  );

  const pendingTasks = useMemo(
    () => tasks.filter((t) => t.status !== "completed").slice(0, 50),
    [tasks],
  );

  const completedTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "completed")
        .sort((a, b) => {
          const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
          const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
          return bTime - aTime;
        }),
    [tasks],
  );

  const upcomingReminders = useMemo(
    () => (dashboard as any)?.upcomingReminders ?? [],
    [dashboard],
  );

  if (dashboardLoading && !dashboard && tasks.length === 0) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator
          size="large"
          color={theme.colors["--color-primary"]}
        />
      </View>
    );
  }

  if (!hasFamily) {
    return (
      <View className="flex-1 bg-background">
        <SafeAreaView edges={["top"]} className="flex-1">
          <View className="flex-1 px-5 items-center justify-center">
            <Ionicons
              name="list-outline"
              size={48}
              color={theme.colors["--color-muted"]}
            />
            <Text className="text-muted text-sm font-sans text-center mt-3">
              Join or create a family to see shared lists.
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
              tintColor={theme.colors["--color-primary"]}
            />
          }
        >
          <MotiView
            from={{ opacity: 0, translateY: 12 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 400 }}
          >
            <View className="mb-2 mt-2">
              <Text className="text-foreground text-2xl font-sans-bold">
                Lists
              </Text>
              <Text className="text-muted text-sm font-sans mt-1">
                Tasks, reminders, and shopping for the family
              </Text>
            </View>

            {error && (
              <Text
                className="text-sm font-sans mb-2"
                style={{ color: theme.colors["--color-danger"] }}
              >
                {error}
              </Text>
            )}

            {/* Reminders */}
            {upcomingReminders.length > 0 && (
              <>
                <SectionHeader
                  title="Reminders"
                  icon="notifications-outline"
                  count={upcomingReminders.length}
                />
                {upcomingReminders.map((r: any) => {
                  const remindDate = new Date(r.remindAt);
                  const isToday =
                    remindDate.toDateString() === new Date().toDateString();
                  const timeStr = remindDate.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  });
                  const dateStr = isToday
                    ? `Today, ${timeStr}`
                    : `${remindDate.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}, ${timeStr}`;
                  return (
                    <View
                      key={r.id}
                      className="bg-surface rounded-2xl p-4 mb-2 border border-primary-soft flex-row items-center"
                    >
                      <Ionicons
                        name="alarm-outline"
                        size={20}
                        color={theme.colors["--color-primary"]}
                      />
                      <View className="flex-1 ml-3">
                        <Text className="text-foreground text-base font-sans-semibold">
                          {r.title}
                        </Text>
                        <Text className="text-muted text-sm font-sans mt-1">
                          {dateStr}
                        </Text>
                        {r.body && (
                          <Text className="text-muted text-xs font-sans mt-0.5">
                            {r.body}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
                <Text className="text-muted text-xs font-sans mt-1 ml-1">
                  Showing next 7 days
                </Text>
              </>
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

            {/* Completed */}
            {completedTasks.length > 0 && (
              <>
                <TouchableOpacity
                  className="flex-row items-center mt-4 mb-2"
                  onPress={() => setShowCompleted(!showCompleted)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={showCompleted ? "chevron-down" : "chevron-forward"}
                    size={18}
                    color={theme.colors["--color-muted"]}
                  />
                  <Text className="text-muted text-sm font-sans-semibold ml-1">
                    Completed ({completedTasks.length})
                  </Text>
                </TouchableOpacity>
                {showCompleted &&
                  completedTasks.map((task) => (
                    <CompletedTaskRow
                      key={task.id}
                      task={task}
                      onUnmark={handleToggleTask}
                    />
                  ))}
              </>
            )}

            {/* Shopping */}
            <SectionHeader
              title="Shopping List"
              icon="cart-outline"
              count={
                shoppingLists[0]?.items.filter((i) => !i.checked).length ?? 0
              }
            />
            {shoppingLists.length > 0 && shoppingLists[0].items.length > 0 ? (
              <View className="bg-surface rounded-2xl p-4 border border-primary-soft">
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

            <View className="h-8" />
          </MotiView>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
