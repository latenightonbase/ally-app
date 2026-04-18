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
import type { CalendarEvent, Task } from "@ally/shared";

function ScheduleItem({ event }: { event: CalendarEvent }) {
  const { theme } = useTheme();
  const time = event.allDay
    ? "All day"
    : new Date(event.startTime).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

  return (
    <View className="flex-row items-center py-3 border-b border-primary-soft">
      <View
        className="w-1 h-10 rounded-full mr-3"
        style={{ backgroundColor: event.color ?? theme.colors["--color-primary"] }}
      />
      <View className="flex-1">
        <Text className="text-foreground font-sans-semibold text-sm">
          {event.title}
        </Text>
        <Text className="text-muted text-xs font-sans mt-0.5">
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
      className="flex-1 bg-surface rounded-2xl py-4 items-center border border-primary-soft active:opacity-70"
    >
      <Ionicons name={icon} size={22} color={theme.colors["--color-primary"]} />
      <Text className="text-foreground text-xs font-sans-semibold mt-1.5">
        {label}
      </Text>
    </Pressable>
  );
}

function TaskQuickView({ tasks }: { tasks: Task[] }) {
  const { theme } = useTheme();
  if (tasks.length === 0) return null;

  return (
    <View className="mt-1">
      {tasks.slice(0, 3).map((task) => (
        <View key={task.id} className="flex-row items-center py-2">
          <Ionicons
            name="ellipse-outline"
            size={16}
            color={theme.colors["--color-muted"]}
          />
          <Text className="text-foreground text-sm font-sans ml-2 flex-1" numberOfLines={1}>
            {task.title}
          </Text>
          {task.priority === "high" && (
            <Ionicons
              name="alert-circle"
              size={14}
              color={theme.colors["--color-error"] ?? "#DC2626"}
            />
          )}
        </View>
      ))}
      {tasks.length > 3 && (
        <Text className="text-muted text-xs font-sans mt-1">
          +{tasks.length - 3} more
        </Text>
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
  const [briefingLoading, setBriefingLoading] = useState(true);

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
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" className="text-primary" />
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
            {/* Greeting */}
            <View className="mb-5 mt-2">
              <Text className="text-foreground text-2xl font-sans-bold">
                {greeting}, {userName || "there"}
              </Text>
              <Text className="text-muted text-sm font-sans mt-1">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
            </View>

            {/* AI Briefing */}
            {briefingText && (
              <View className="bg-primary/10 rounded-2xl p-4 mb-5 border border-primary-soft">
                <View className="flex-row items-center mb-2">
                  <Text className="text-lg mr-2">📋</Text>
                  <Text className="text-primary font-sans-bold text-sm">
                    Anzi's Morning Briefing
                  </Text>
                </View>
                <Text className="text-foreground text-sm font-sans leading-5">
                  {briefingText.length > 500
                    ? briefingText.slice(0, 500) + "..."
                    : briefingText}
                </Text>
              </View>
            )}

            {/* Quick Actions */}
            <View className="flex-row gap-3 mb-5">
              <QuickAction
                icon="add-circle-outline"
                label="Add Event"
                onPress={() => router.push("/(tabs)/chat")}
              />
              <QuickAction
                icon="cart-outline"
                label="Grocery List"
                onPress={() => router.push("/(tabs)/family")}
              />
              <QuickAction
                icon="notifications-outline"
                label="Remind"
                onPress={() => router.push("/(tabs)/chat")}
              />
            </View>

            {/* Today's Schedule */}
            <View className="mb-5">
              <View className="flex-row items-center mb-3">
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={theme.colors["--color-primary"]}
                />
                <Text className="text-foreground text-base font-sans-bold ml-2">
                  Today's Schedule
                </Text>
                {todayEvents.length > 0 && (
                  <View className="bg-primary-soft rounded-full px-2 py-0.5 ml-2">
                    <Text className="text-primary text-xs font-sans-bold">
                      {todayEvents.length}
                    </Text>
                  </View>
                )}
              </View>

              {todayEvents.length > 0 ? (
                <View className="bg-surface rounded-2xl px-4 border border-primary-soft">
                  {todayEvents.map((event, i) => (
                    <ScheduleItem key={event.id} event={event} />
                  ))}
                </View>
              ) : (
                <View className="bg-surface/50 rounded-2xl p-5 items-center">
                  <Text className="text-2xl mb-1">🎉</Text>
                  <Text className="text-muted text-sm font-sans text-center">
                    Clear day ahead — no scheduled chaos!
                  </Text>
                </View>
              )}
            </View>

            {/* Action Items */}
            {pendingTasks.length > 0 && (
              <View className="mb-5">
                <View className="flex-row items-center mb-3">
                  <Ionicons
                    name="checkbox-outline"
                    size={18}
                    color={theme.colors["--color-primary"]}
                  />
                  <Text className="text-foreground text-base font-sans-bold ml-2">
                    To Do
                  </Text>
                  <View className="bg-primary-soft rounded-full px-2 py-0.5 ml-2">
                    <Text className="text-primary text-xs font-sans-bold">
                      {pendingTasks.length}
                    </Text>
                  </View>
                </View>
                <View className="bg-surface rounded-2xl px-4 py-1 border border-primary-soft">
                  <TaskQuickView tasks={pendingTasks} />
                </View>
              </View>
            )}

            {/* Shopping */}
            {groceryCount > 0 && (
              <Pressable
                onPress={() => router.push("/(tabs)/family")}
                className="bg-surface rounded-2xl p-4 flex-row items-center border border-primary-soft mb-5 active:opacity-70"
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{
                    backgroundColor: theme.colors["--color-primary"] + "20",
                  }}
                >
                  <Ionicons
                    name="cart"
                    size={20}
                    color={theme.colors["--color-primary"]}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-foreground font-sans-semibold text-sm">
                    Grocery List
                  </Text>
                  <Text className="text-muted text-xs font-sans">
                    {groceryCount} item{groceryCount !== 1 ? "s" : ""} remaining
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={theme.colors["--color-muted"]}
                />
              </Pressable>
            )}
          </MotiView>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
