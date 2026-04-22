import React, { useEffect, useCallback, useMemo, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAppStore } from "../../store/useAppStore";
import { useFamilyStore } from "../../store/useFamilyStore";
import {
  getFamilyDashboard,
  getTodayBriefing,
  getTasks,
  getShoppingLists,
} from "../../lib/api";
import { useTheme } from "../../context/ThemeContext";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { AddFab } from "../../components/ui/AddFab";
import { CreateReminderSheet } from "../../components/modals/CreateReminderSheet";
import { CreateTaskSheet } from "../../components/modals/CreateTaskSheet";
import { AddShoppingItemSheet } from "../../components/modals/AddShoppingItemSheet";
import type { CalendarEvent, Task, Reminder } from "@ally/shared";

function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: object;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const inner = {
    backgroundColor: theme.colors["--color-surface"],
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors["--color-border"],
    padding: 18,
    ...(style ?? {}),
  } as const;
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={inner} className="active:opacity-80">
        {children}
      </Pressable>
    );
  }
  return <View style={inner}>{children}</View>;
}

function SectionHeader({
  icon,
  title,
  badge,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  badge?: number;
}) {
  const { theme } = useTheme();
  return (
    <View className="flex-row items-center mb-3 px-1">
      <Ionicons name={icon} size={16} color={theme.colors["--color-primary"]} />
      <Text
        className="text-base font-sans-bold ml-2"
        style={{ color: theme.colors["--color-foreground"] }}
      >
        {title}
      </Text>
      {typeof badge === "number" && badge > 0 && (
        <View
          className="rounded-full px-2 py-0.5 ml-2"
          style={{ backgroundColor: theme.colors["--color-primary-soft"] }}
        >
          <Text
            className="text-xs font-sans-bold"
            style={{ color: theme.colors["--color-primary"] }}
          >
            {badge}
          </Text>
        </View>
      )}
    </View>
  );
}

function ScheduleRow({
  event,
  last,
}: {
  event: CalendarEvent;
  last?: boolean;
}) {
  const { theme } = useTheme();
  const color = event.color ?? theme.colors["--color-primary"];
  const time = event.allDay
    ? "All day"
    : new Date(event.startTime).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

  return (
    <View
      className="flex-row items-center py-3"
      style={{
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors["--color-border"],
      }}
    >
      <View
        style={{
          width: 4,
          height: 36,
          borderRadius: 2,
          backgroundColor: color,
          marginRight: 14,
        }}
      />
      <View className="flex-1">
        <Text
          className="font-sans-bold text-sm"
          style={{ color: theme.colors["--color-foreground"] }}
        >
          {event.title}
        </Text>
        <Text
          className="text-xs font-sans mt-0.5"
          style={{ color: theme.colors["--color-muted"] }}
        >
          {time}
          {event.location ? ` · ${event.location}` : ""}
        </Text>
      </View>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 items-center active:opacity-80"
      style={{
        backgroundColor: theme.colors["--color-surface"],
        borderWidth: 1,
        borderColor: theme.colors["--color-border"],
        borderRadius: 20,
        paddingVertical: 14,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: theme.colors["--color-primary-soft"],
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 6,
        }}
      >
        <Ionicons name={icon} size={18} color={theme.colors["--color-primary"]} />
      </View>
      <Text
        className="text-xs font-sans-bold"
        style={{ color: theme.colors["--color-foreground"] }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function TaskRow({ task, last }: { task: Task; last?: boolean }) {
  const { theme } = useTheme();
  return (
    <View
      className="flex-row items-center py-3"
      style={{
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors["--color-border"],
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: theme.colors["--color-border"],
          marginRight: 12,
        }}
      />
      <Text
        className="text-sm font-sans-semibold flex-1"
        style={{ color: theme.colors["--color-foreground"] }}
        numberOfLines={1}
      >
        {task.title}
      </Text>
      {task.priority === "high" && (
        <Ionicons
          name="alert-circle"
          size={16}
          color={theme.colors["--color-danger"]}
        />
      )}
    </View>
  );
}

export default function HomeScreen() {
  const userName = useAppStore((s) => s.user.name);
  const {
    dashboard,
    dashboardLoading,
    setDashboard,
    setDashboardLoading,
    setTasks,
    tasks,
    setShoppingLists,
    shoppingLists,
  } = useFamilyStore();
  const { theme } = useTheme();

  const [refreshing, setRefreshing] = useState(false);
  const [briefingText, setBriefingText] = useState<string | null>(null);
  const [, setBriefingLoading] = useState(true);
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [shoppingSheetOpen, setShoppingSheetOpen] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setDashboardLoading(true);

      try {
        const [dashData, taskData, shopData, briefData] = await Promise.all([
          getFamilyDashboard().catch(() => null),
          getTasks().catch(() => ({ tasks: [] })),
          getShoppingLists().catch(() => ({ lists: [] })),
          getTodayBriefing().catch(() => ({ briefing: null })),
        ]);

        if (dashData) setDashboard(dashData);
        setTasks(taskData.tasks);
        setShoppingLists(shopData.lists);
        setBriefingText(briefData?.briefing?.content ?? null);
      } catch {
        // best-effort
      } finally {
        setDashboardLoading(false);
        setRefreshing(false);
        setBriefingLoading(false);
      }
    },
    [setDashboard, setDashboardLoading, setTasks, setShoppingLists],
  );

  useEffect(() => {
    load();
  }, [load]);

  const todayEvents = useMemo(
    () => dashboard?.todayEvents ?? [],
    [dashboard],
  );

  const upcomingReminders = useMemo(
    () => ((dashboard as unknown as { upcomingReminders?: Reminder[] })?.upcomingReminders ?? []),
    [dashboard],
  ) as Reminder[];

  const pendingTasks = useMemo(
    () => tasks.filter((t) => t.status !== "completed").slice(0, 5),
    [tasks],
  );

  const groceryCount = useMemo(() => {
    if (!shoppingLists.length) return 0;
    return shoppingLists[0].items.filter((i) => !i.checked).length;
  }, [shoppingLists]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  if (dashboardLoading && !dashboard) {
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

  const briefingLines = briefingText
    ? briefingText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("•") || line.startsWith("-"))
        .map((line) => line.replace(/^[•\-]\s*/, ""))
    : [];

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: theme.colors["--color-background"] }}
    >
      <SafeAreaView edges={["top"]} className="flex-1">
        <ScreenHeader />
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
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
            animate={{ opacity: 1, translateY:0 }}
            transition={{ type: "timing", duration: 400 }}
          >
            <View className="mb-5 mt-1">
              <Text
                className="text-2xl font-sans-bold"
                style={{ color: theme.colors["--color-foreground"] }}
              >
                {greeting},{"\n"}
                <Text style={{ color: theme.colors["--color-primary"] }}>
                  {userName || "there"}
                </Text>
              </Text>
              <Text
                className="text-sm font-sans mt-2"
                style={{ color: theme.colors["--color-muted"] }}
              >
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
            </View>

            {briefingLines.length > 0 && (
              <View
                className="rounded-3xl p-5 mb-5"
                style={{
                  backgroundColor: theme.colors["--color-primary-soft"],
                  borderWidth: 1,
                  borderColor: theme.colors["--color-primary-soft"],
                }}
              >
                <View className="flex-row items-center mb-3">
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: theme.colors["--color-primary"],
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 10,
                    }}
                  >
                    <Ionicons name="sparkles" size={16} color="#ffffff" />
                  </View>
                  <Text
                    className="font-sans-bold text-sm"
                    style={{ color: theme.colors["--color-primary"] }}
                  >
                    Today at a Glance
                  </Text>
                </View>
                {briefingLines.map((line, idx) => (
                  <View key={idx} className="flex-row mb-1.5">
                    <Text
                      className="font-sans-bold mr-2"
                      style={{ color: theme.colors["--color-primary"] }}
                    >
                      •
                    </Text>
                    <Text
                      className="text-sm font-sans flex-1"
                      style={{
                        color: theme.colors["--color-foreground"],
                        lineHeight: 20,
                      }}
                    >
                      {line}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View className="flex-row gap-3 mb-6">
              <QuickAction
                icon="add"
                label="Add Event"
                onPress={() => router.push("/(tabs)/calendar")}
              />
              <QuickAction
                icon="cart-outline"
                label="Shopping"
                onPress={() => setShoppingSheetOpen(true)}
              />
              <QuickAction
                icon="notifications-outline"
                label="Remind Me"
                onPress={() => setReminderSheetOpen(true)}
              />
            </View>

            <View className="mb-5">
              <SectionHeader
                icon="calendar-outline"
                title="Today's Schedule"
                badge={todayEvents.length}
              />
              {todayEvents.length > 0 ? (
                <Card>
                  {todayEvents.map((event, i) => (
                    <ScheduleRow
                      key={event.id}
                      event={event}
                      last={i === todayEvents.length - 1}
                    />
                  ))}
                </Card>
              ) : (
                <Card>
                  <View className="items-center py-2">
                    <Text className="text-2xl mb-1">🎉</Text>
                    <Text
                      className="text-sm font-sans text-center"
                      style={{ color: theme.colors["--color-muted"] }}
                    >
                      Clear day ahead — no scheduled chaos!
                    </Text>
                  </View>
                </Card>
              )}
            </View>

            {upcomingReminders.length > 0 && (
              <View className="mb-5">
                <SectionHeader
                  icon="notifications-outline"
                  title="Reminders"
                  badge={upcomingReminders.length}
                />
                <Card>
                  {upcomingReminders.slice(0, 5).map((r, i, arr) => {
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
                        className="flex-row items-center py-3"
                        style={{
                          borderBottomWidth: last ? 0 : 1,
                          borderBottomColor: theme.colors["--color-border"],
                        }}
                      >
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor:
                              theme.colors["--color-primary-soft"],
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 12,
                          }}
                        >
                          <Ionicons
                            name="alarm-outline"
                            size={15}
                            color={theme.colors["--color-primary"]}
                          />
                        </View>
                        <View className="flex-1">
                          <Text
                            className="font-sans-bold text-sm"
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
              </View>
            )}

            {pendingTasks.length > 0 && (
              <View className="mb-5">
                <SectionHeader
                  icon="checkbox-outline"
                  title="To Do"
                  badge={pendingTasks.length}
                />
                <Card>
                  {pendingTasks.map((t, i, arr) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      last={i === arr.length - 1}
                    />
                  ))}
                </Card>
              </View>
            )}

            {groceryCount > 0 && (
              <View className="mb-5">
                <SectionHeader icon="cart-outline" title="Shopping" />
                <Card onPress={() => router.push("/(tabs)/lists")}>
                  <View className="flex-row items-center">
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: theme.colors["--color-primary-soft"],
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 14,
                      }}
                    >
                      <Ionicons
                        name="cart"
                        size={20}
                        color={theme.colors["--color-primary"]}
                      />
                    </View>
                    <View className="flex-1">
                      <Text
                        className="font-sans-bold text-sm"
                        style={{ color: theme.colors["--color-foreground"] }}
                      >
                        Grocery List
                      </Text>
                      <Text
                        className="text-xs font-sans mt-0.5"
                        style={{ color: theme.colors["--color-muted"] }}
                      >
                        {groceryCount} item
                        {groceryCount !== 1 ? "s" : ""} remaining
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={theme.colors["--color-faint"]}
                    />
                  </View>
                </Card>
              </View>
            )}
          </MotiView>
        </ScrollView>
      </SafeAreaView>

      <AddFab
        actions={[
          {
            id: "reminder",
            label: "Reminder",
            icon: "notifications-outline",
            onPress: () => setReminderSheetOpen(true),
          },
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

      <CreateReminderSheet
        visible={reminderSheetOpen}
        onClose={() => setReminderSheetOpen(false)}
        onCreated={() => load(true)}
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
