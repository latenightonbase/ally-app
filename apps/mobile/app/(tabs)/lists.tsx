import React, { useEffect, useCallback, useMemo, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Pressable,
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
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { AddFab } from "../../components/ui/AddFab";
import { CreateTaskSheet } from "../../components/modals/CreateTaskSheet";
import { AddShoppingItemSheet } from "../../components/modals/AddShoppingItemSheet";
import type { Task, ShoppingListItem, Reminder } from "@ally/shared";

function Card({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors["--color-surface"],
        borderRadius: 24,
        borderWidth: 1,
        borderColor: theme.colors["--color-border"],
        padding: 16,
      }}
    >
      {children}
    </View>
  );
}

function SectionHeader({
  title,
  icon,
  count,
  trailing,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  count?: number;
  trailing?: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View className="flex-row items-center mb-3 mt-6 px-1">
      <Ionicons name={icon} size={16} color={theme.colors["--color-primary"]} />
      <Text
        className="text-base font-sans-bold ml-2"
        style={{ color: theme.colors["--color-foreground"] }}
      >
        {title}
      </Text>
      {count !== undefined && count > 0 && (
        <View
          className="rounded-full px-2 py-0.5 ml-2"
          style={{ backgroundColor: theme.colors["--color-primary-soft"] }}
        >
          <Text
            className="text-xs font-sans-bold"
            style={{ color: theme.colors["--color-primary"] }}
          >
            {count}
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }} />
      {trailing}
    </View>
  );
}

function CircleCheckbox({ checked }: { checked: boolean }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: checked
          ? theme.colors["--color-primary"]
          : theme.colors["--color-border"],
        backgroundColor: checked
          ? theme.colors["--color-primary"]
          : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
    </View>
  );
}

function SquareCheckbox({ checked }: { checked: boolean }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: checked
          ? theme.colors["--color-primary"]
          : theme.colors["--color-border"],
        backgroundColor: checked
          ? theme.colors["--color-primary"]
          : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
    </View>
  );
}

function TaskRow({
  task,
  onToggle,
  last,
}: {
  task: Task & {
    assignedToName?: string | null;
    assignedToNames?: string[] | null;
  };
  onToggle: (taskId: string) => void;
  last?: boolean;
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
    <Pressable
      className="flex-row items-center active:opacity-80"
      onPress={() => onToggle(task.id)}
      style={{
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors["--color-border"],
      }}
    >
      <CircleCheckbox checked={isCompleted} />
      <View className="flex-1 ml-3">
        <Text
          className="text-sm font-sans-bold"
          style={{
            color: isCompleted
              ? theme.colors["--color-muted"]
              : theme.colors["--color-foreground"],
            textDecorationLine: isCompleted ? "line-through" : "none",
          }}
        >
          {task.title}
        </Text>
        {(task.assignedToName || dueText) && (
          <Text
            className="text-xs font-sans mt-0.5"
            style={{ color: theme.colors["--color-muted"] }}
          >
            {[task.assignedToName, dueText].filter(Boolean).join(" · ")}
          </Text>
        )}
      </View>
      {task.priority === "high" && !isCompleted && (
        <Ionicons
          name="alert-circle"
          size={16}
          color={theme.colors["--color-danger"]}
        />
      )}
    </Pressable>
  );
}

function CompletedTaskRow({
  task,
  onUnmark,
  last,
}: {
  task: Task & {
    assignedToName?: string | null;
    assignedToNames?: string[] | null;
    completedByName?: string | null;
  };
  onUnmark: (taskId: string) => void;
  last?: boolean;
}) {
  const { theme } = useTheme();
  const completedTime = task.completedAt
    ? new Date(task.completedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;
  const completedBy = task.completedByName ?? task.assignedToName ?? null;

  return (
    <View
      className="flex-row items-center"
      style={{
        paddingVertical: 10,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors["--color-border"],
      }}
    >
      <CircleCheckbox checked />
      <View className="flex-1 ml-3">
        <Text
          className="text-sm font-sans-semibold"
          style={{
            color: theme.colors["--color-muted"],
            textDecorationLine: "line-through",
          }}
        >
          {task.title}
        </Text>
        <Text
          className="text-xs font-sans mt-0.5"
          style={{ color: theme.colors["--color-faint"] }}
        >
          {[completedBy ? `by ${completedBy}` : null, completedTime]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => onUnmark(task.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        className="ml-2 px-2.5 py-1 rounded-full"
        style={{ backgroundColor: theme.colors["--color-primary-soft"] }}
      >
        <Text
          className="text-xs font-sans-bold"
          style={{ color: theme.colors["--color-primary"] }}
        >
          Undo
        </Text>
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
      {unchecked.map((item, i) => (
        <Pressable
          key={item.id}
          className="flex-row items-center active:opacity-80"
          onPress={() => onToggleItem(item.id)}
          style={{
            paddingVertical: 11,
            borderBottomWidth: i === unchecked.length - 1 && checked.length === 0 ? 0 : 1,
            borderBottomColor: theme.colors["--color-border"],
          }}
        >
          <SquareCheckbox checked={false} />
          <Text
            className="text-sm font-sans-semibold ml-3 flex-1"
            style={{ color: theme.colors["--color-foreground"] }}
          >
            {item.name}
          </Text>
          {item.quantity && (
            <Text
              className="text-xs font-sans-semibold"
              style={{ color: theme.colors["--color-muted"] }}
            >
              {item.quantity}
            </Text>
          )}
        </Pressable>
      ))}
      {checked.length > 0 && (
        <View className="mt-2">
          <Text
            className="text-xs font-sans-bold mb-1"
            style={{
              color: theme.colors["--color-muted"],
              letterSpacing: 1.2,
              textTransform: "uppercase",
            }}
          >
            Checked off ({checked.length})
          </Text>
          {checked.slice(0, 3).map((item) => (
            <Pressable
              key={item.id}
              className="flex-row items-center py-2 active:opacity-80"
              onPress={() => onToggleItem(item.id)}
            >
              <SquareCheckbox checked />
              <Text
                className="text-sm font-sans ml-3"
                style={{
                  color: theme.colors["--color-muted"],
                  textDecorationLine: "line-through",
                }}
              >
                {item.name}
              </Text>
            </Pressable>
          ))}
          {checked.length > 3 && (
            <Text
              className="text-xs font-sans mt-1 ml-8"
              style={{ color: theme.colors["--color-faint"] }}
            >
              +{checked.length - 3} more
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

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
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [shoppingSheetOpen, setShoppingSheetOpen] = useState(false);

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
    () =>
      (dashboard as unknown as { upcomingReminders?: Reminder[] })
        ?.upcomingReminders ?? [],
    [dashboard],
  );

  if (dashboardLoading && !dashboard && tasks.length === 0) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: theme.colors["--color-background"] }}
      >
        <ActivityIndicator
          size="large"
          color={theme.colors["--color-primary"]}
        />
      </View>
    );
  }

  if (!hasFamily) {
    return (
      <View
        className="flex-1"
        style={{ backgroundColor: theme.colors["--color-background"] }}
      >
        <SafeAreaView edges={["top"]} className="flex-1">
          <ScreenHeader title="Lists" />
          <View className="flex-1 px-5 items-center justify-center">
            <Ionicons
              name="list-outline"
              size={48}
              color={theme.colors["--color-muted"]}
            />
            <Text
              className="text-sm font-sans text-center mt-3"
              style={{ color: theme.colors["--color-muted"] }}
            >
              Join or create a family to see shared lists.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: theme.colors["--color-background"] }}
    >
      <SafeAreaView edges={["top"]} className="flex-1">
        <ScreenHeader title="Lists" subtitle="Tasks, reminders & shopping" />
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 140 }}
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
            {error && (
              <Text
                className="text-sm font-sans mb-2"
                style={{ color: theme.colors["--color-danger"] }}
              >
                {error}
              </Text>
            )}

            {upcomingReminders.length > 0 && (
              <>
                <SectionHeader
                  title="Reminders"
                  icon="notifications-outline"
                  count={upcomingReminders.length}
                />
                <Card>
                  {upcomingReminders.map((r, i, arr) => {
                    const remindDate = new Date(r.remindAt);
                    const isToday =
                      remindDate.toDateString() ===
                      new Date().toDateString();
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
                    const last = i === arr.length - 1;
                    return (
                      <View
                        key={r.id}
                        className="flex-row items-center"
                        style={{
                          paddingVertical: 12,
                          borderBottomWidth: last ? 0 : 1,
                          borderBottomColor: theme.colors["--color-border"],
                        }}
                      >
                        <View
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            backgroundColor:
                              theme.colors["--color-primary-soft"],
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 12,
                          }}
                        >
                          <Ionicons
                            name="alarm-outline"
                            size={16}
                            color={theme.colors["--color-primary"]}
                          />
                        </View>
                        <View className="flex-1">
                          <Text
                            className="text-sm font-sans-bold"
                            style={{
                              color: theme.colors["--color-foreground"],
                            }}
                          >
                            {r.title}
                          </Text>
                          <Text
                            className="text-xs font-sans mt-0.5"
                            style={{ color: theme.colors["--color-muted"] }}
                          >
                            {dateStr}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </Card>
              </>
            )}

            <SectionHeader
              title="To Do"
              icon="checkbox-outline"
              count={pendingTasks.length}
              trailing={
                <Pressable
                  onPress={() => setTaskSheetOpen(true)}
                  className="active:opacity-70"
                  hitSlop={8}
                >
                  <Text
                    className="text-xs font-sans-bold"
                    style={{ color: theme.colors["--color-primary"] }}
                  >
                    + Add
                  </Text>
                </Pressable>
              }
            />
            {pendingTasks.length > 0 ? (
              <Card>
                {pendingTasks.map((task, i) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={handleToggleTask}
                    last={i === pendingTasks.length - 1}
                  />
                ))}
              </Card>
            ) : (
              <Card>
                <View className="items-center py-4">
                  <Ionicons
                    name="checkmark-done-outline"
                    size={32}
                    color={theme.colors["--color-muted"]}
                  />
                  <Text
                    className="text-sm font-sans mt-2 text-center"
                    style={{ color: theme.colors["--color-muted"] }}
                  >
                    All caught up! 🎉
                  </Text>
                </View>
              </Card>
            )}

            {completedTasks.length > 0 && (
              <>
                <TouchableOpacity
                  className="flex-row items-center mt-4 mb-2 px-1"
                  onPress={() => setShowCompleted(!showCompleted)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={showCompleted ? "chevron-down" : "chevron-forward"}
                    size={14}
                    color={theme.colors["--color-muted"]}
                  />
                  <Text
                    className="text-xs font-sans-bold ml-1"
                    style={{
                      color: theme.colors["--color-muted"],
                      letterSpacing: 1.2,
                      textTransform: "uppercase",
                    }}
                  >
                    Completed ({completedTasks.length})
                  </Text>
                </TouchableOpacity>
                {showCompleted && (
                  <Card>
                    {completedTasks.map((task, i) => (
                      <CompletedTaskRow
                        key={task.id}
                        task={task}
                        onUnmark={handleToggleTask}
                        last={i === completedTasks.length - 1}
                      />
                    ))}
                  </Card>
                )}
              </>
            )}

            <SectionHeader
              title="Shopping List"
              icon="cart-outline"
              count={
                shoppingLists[0]?.items.filter((i) => !i.checked).length ?? 0
              }
              trailing={
                <Pressable
                  onPress={() => setShoppingSheetOpen(true)}
                  className="active:opacity-70"
                  hitSlop={8}
                >
                  <Text
                    className="text-xs font-sans-bold"
                    style={{ color: theme.colors["--color-primary"] }}
                  >
                    + Add
                  </Text>
                </Pressable>
              }
            />
            {shoppingLists.length > 0 && shoppingLists[0].items.length > 0 ? (
              <Card>
                <ShoppingSection
                  lists={shoppingLists}
                  onToggleItem={handleToggleShoppingItem}
                />
              </Card>
            ) : (
              <Card>
                <View className="items-center py-4">
                  <Ionicons
                    name="bag-check-outline"
                    size={32}
                    color={theme.colors["--color-muted"]}
                  />
                  <Text
                    className="text-sm font-sans mt-2 text-center"
                    style={{ color: theme.colors["--color-muted"] }}
                  >
                    Shopping list is empty — tell Anzi what you need!
                  </Text>
                </View>
              </Card>
            )}

            <View className="h-8" />
          </MotiView>
        </ScrollView>
      </SafeAreaView>

      <AddFab
        actions={[
          {
            id: "task",
            label: "Task",
            icon: "checkmark-done-outline",
            onPress: () => setTaskSheetOpen(true),
          },
          {
            id: "shopping",
            label: "Shopping item",
            icon: "cart-outline",
            onPress: () => setShoppingSheetOpen(true),
          },
        ]}
      />

      <CreateTaskSheet
        visible={taskSheetOpen}
        onClose={() => setTaskSheetOpen(false)}
        onCreated={() => load(true)}
      />
      <AddShoppingItemSheet
        visible={shoppingSheetOpen}
        onClose={() => setShoppingSheetOpen(false)}
        onAdded={() => load(true)}
      />
    </View>
  );
}
