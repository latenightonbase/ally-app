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
import { Calendar, LocaleConfig } from "react-native-calendars";
import { useAppStore } from "../../store/useAppStore";
import { useFamilyStore } from "../../store/useFamilyStore";
import {
  getCalendarEvents,
  getTasks,
  getReminders,
} from "../../lib/api";
import { useTheme } from "../../context/ThemeContext";
import type { CalendarEvent, Task } from "@ally/shared";

type DashboardReminder = {
  id: string;
  title: string;
  body: string | null;
  remindAt: string;
  targetMemberId?: string | null;
};

LocaleConfig.locales["en"] = {
  monthNames: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
  monthNamesShort: [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ],
  dayNames: [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday",
  ],
  dayNamesShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  today: "Today",
};
LocaleConfig.defaultLocale = "en";

type ScheduleItemKind = "event" | "task" | "reminder";

interface ScheduleItem {
  id: string;
  kind: ScheduleItemKind;
  title: string;
  subtitle?: string;
  time: Date;
  allDay?: boolean;
  location?: string | null;
  color?: string | null;
  assignedNames?: string[];
  status?: string;
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function ItemCard({ item }: { item: ScheduleItem }) {
  const { theme } = useTheme();
  const iconName: React.ComponentProps<typeof Ionicons>["name"] =
    item.kind === "event"
      ? "calendar-outline"
      : item.kind === "task"
        ? "checkbox-outline"
        : "alarm-outline";
  const isCompleted = item.status === "completed";

  return (
    <View className="bg-surface rounded-2xl p-4 mb-2 border border-primary-soft">
      <View className="flex-row items-start">
        <View
          className="w-9 h-9 rounded-full items-center justify-center mr-3"
          style={{
            backgroundColor:
              (item.color ?? theme.colors["--color-primary"]) + "20",
          }}
        >
          <Ionicons
            name={iconName}
            size={18}
            color={item.color ?? theme.colors["--color-primary"]}
          />
        </View>
        <View className="flex-1">
          <Text
            className={`text-foreground text-base font-sans-semibold ${
              isCompleted ? "line-through text-muted" : ""
            }`}
          >
            {item.title}
          </Text>
          <Text className="text-muted text-xs font-sans mt-0.5">
            {item.allDay ? "All day" : formatTime(item.time)}
            {item.location ? ` · ${item.location}` : ""}
            {item.subtitle ? ` · ${item.subtitle}` : ""}
          </Text>
          {item.assignedNames && item.assignedNames.length > 0 && (
            <View className="flex-row flex-wrap mt-1.5">
              {item.assignedNames.map((name, i) => (
                <Text key={i} className="text-muted text-xs font-sans mr-2">
                  {name}
                </Text>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default function CalendarScreen() {
  const user = useAppStore((s) => s.user);
  const { family, dashboard, members } = useFamilyStore();
  const { theme } = useTheme();

  const [selectedDate, setSelectedDate] = useState<string>(
    toDateKey(new Date()),
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<DashboardReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFamily = !!family || !!dashboard;

  const memberMap = useMemo(() => {
    const map = new Map<string, string>();
    (dashboard?.members ?? members).forEach((m) => map.set(m.id, m.name));
    return map;
  }, [dashboard, members]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!hasFamily) {
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const now = new Date();
        const start = new Date(now);
        start.setMonth(start.getMonth() - 6);
        const end = new Date(now);
        end.setMonth(end.getMonth() + 12);

        const [eventsRes, tasksRes, remindersRes] = await Promise.all([
          getCalendarEvents(start.toISOString(), end.toISOString()).catch(
            () => ({ events: [] as CalendarEvent[] }),
          ),
          getTasks().catch(() => ({ tasks: [] as Task[] })),
          getReminders({
            start: start.toISOString(),
            end: end.toISOString(),
          }).catch(() => ({ reminders: [] as DashboardReminder[] })),
        ]);

        setEvents(eventsRes.events ?? []);
        setTasks(tasksRes.tasks ?? []);
        setReminders(remindersRes.reminders ?? []);
      } catch {
        setError("Couldn't load calendar. Pull down to try again.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [hasFamily],
  );

  useEffect(() => {
    load();
  }, [load]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();

    const push = (key: string, item: ScheduleItem) => {
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    };

    for (const event of events) {
      const date = new Date(event.startTime);
      const key = toDateKey(date);
      const assignedNames = (event.assignedTo ?? [])
        .map((id) => memberMap.get(id))
        .filter(Boolean) as string[];
      push(key, {
        id: `event-${event.id}`,
        kind: "event",
        title: event.title,
        time: date,
        allDay: event.allDay,
        location: event.location,
        color: event.color,
        assignedNames,
      });
    }

    for (const task of tasks) {
      if (!task.dueDate) continue;
      const date = new Date(task.dueDate);
      const key = toDateKey(date);
      const assignee = task.assignedTo ? memberMap.get(task.assignedTo) : null;
      push(key, {
        id: `task-${task.id}`,
        kind: "task",
        title: task.title,
        time: date,
        subtitle: assignee ?? undefined,
        status: task.status,
      });
    }

    for (const reminder of reminders) {
      const date = new Date(reminder.remindAt);
      const key = toDateKey(date);
      const assignee = reminder.targetMemberId
        ? memberMap.get(reminder.targetMemberId)
        : null;
      push(key, {
        id: `reminder-${reminder.id}`,
        kind: "reminder",
        title: reminder.title,
        time: date,
        subtitle: assignee ?? reminder.body ?? undefined,
      });
    }

    for (const [key, arr] of map) {
      arr.sort((a, b) => a.time.getTime() - b.time.getTime());
      map.set(key, arr);
    }

    return map;
  }, [events, tasks, reminders, memberMap]);

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    const primary = theme.colors["--color-primary"];

    for (const [key, arr] of itemsByDate) {
      const hasEvent = arr.some((i) => i.kind === "event");
      const hasTask = arr.some((i) => i.kind === "task");
      const hasReminder = arr.some((i) => i.kind === "reminder");
      const dots: { key: string; color: string }[] = [];
      if (hasEvent) dots.push({ key: "event", color: primary });
      if (hasTask)
        dots.push({ key: "task", color: theme.colors["--color-secondary"] });
      if (hasReminder)
        dots.push({ key: "reminder", color: theme.colors["--color-accent"] });
      marks[key] = { dots };
    }

    marks[selectedDate] = {
      ...(marks[selectedDate] ?? {}),
      selected: true,
      selectedColor: primary,
    };

    return marks;
  }, [itemsByDate, selectedDate, theme]);

  const selectedItems = itemsByDate.get(selectedDate) ?? [];
  const isToday = selectedDate === toDateKey(new Date());
  const selectedDateObj = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [selectedDate]);

  const calendarTheme = useMemo(
    () => ({
      backgroundColor: theme.colors["--color-background"],
      calendarBackground: theme.colors["--color-background"],
      textSectionTitleColor: theme.colors["--color-muted"],
      selectedDayBackgroundColor: theme.colors["--color-primary"],
      selectedDayTextColor: "#ffffff",
      todayTextColor: theme.colors["--color-primary"],
      dayTextColor: theme.colors["--color-foreground"],
      textDisabledColor: theme.colors["--color-muted"] + "60",
      monthTextColor: theme.colors["--color-foreground"],
      arrowColor: theme.colors["--color-primary"],
      textMonthFontFamily: "PlusJakartaSans_700Bold",
      textDayFontFamily: "PlusJakartaSans_500Medium",
      textDayHeaderFontFamily: "PlusJakartaSans_600SemiBold",
      textMonthFontSize: 18,
      textDayFontSize: 14,
      textDayHeaderFontSize: 12,
    }),
    [theme],
  );

  if (loading) {
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
              name="calendar-outline"
              size={48}
              color={theme.colors["--color-muted"]}
            />
            <Text className="text-muted text-sm font-sans text-center mt-3">
              Join or create a family to see the shared calendar.
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
          className="flex-1"
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
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300 }}
          >
            {/* Header */}
            <View className="px-5 mt-2 mb-2 flex-row items-end justify-between">
              <View>
                <Text className="text-foreground text-2xl font-sans-bold">
                  Calendar
                </Text>
                <Text className="text-muted text-sm font-sans mt-1">
                  {family?.name ?? dashboard?.family?.name ?? `${user.name}'s Family`}
                </Text>
              </View>
              {!isToday && (
                <TouchableOpacity
                  onPress={() => setSelectedDate(toDateKey(new Date()))}
                  className="rounded-full px-3 py-1.5 border border-primary-soft flex-row items-center"
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="today-outline"
                    size={14}
                    color={theme.colors["--color-primary"]}
                  />
                  <Text className="text-primary text-xs font-sans-semibold ml-1">
                    Today
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Month Calendar */}
            <View className="mx-3 mb-2 rounded-2xl overflow-hidden bg-background">
              <Calendar
                current={selectedDate}
                onDayPress={(day) => setSelectedDate(day.dateString)}
                markingType="multi-dot"
                markedDates={markedDates}
                theme={calendarTheme as any}
                enableSwipeMonths
                firstDay={0}
              />
            </View>

            {/* Legend */}
            <View className="px-5 mb-2 flex-row flex-wrap">
              <View className="flex-row items-center mr-4 mb-1">
                <View
                  className="w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: theme.colors["--color-primary"] }}
                />
                <Text className="text-muted text-xs font-sans">Events</Text>
              </View>
              <View className="flex-row items-center mr-4 mb-1">
                <View
                  className="w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: theme.colors["--color-secondary"] }}
                />
                <Text className="text-muted text-xs font-sans">Tasks</Text>
              </View>
              <View className="flex-row items-center mr-4 mb-1">
                <View
                  className="w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: theme.colors["--color-accent"] }}
                />
                <Text className="text-muted text-xs font-sans">Reminders</Text>
              </View>
            </View>

            {/* Selected day schedule */}
            <View className="px-5 mt-2">
              <Text className="text-foreground text-lg font-sans-bold">
                {selectedDateObj.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
              <Text className="text-muted text-xs font-sans mb-3">
                {selectedItems.length === 0
                  ? "Nothing scheduled"
                  : `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"}`}
              </Text>

              {error && (
                <Text
                  className="text-sm font-sans mb-2"
                  style={{ color: theme.colors["--color-danger"] }}
                >
                  {error}
                </Text>
              )}

              {selectedItems.length > 0 ? (
                selectedItems.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))
              ) : (
                <View className="bg-surface/50 rounded-2xl p-6 items-center">
                  <Ionicons
                    name="sunny-outline"
                    size={32}
                    color={theme.colors["--color-muted"]}
                  />
                  <Text className="text-muted text-sm font-sans mt-2 text-center">
                    {selectedDateObj < new Date(new Date().toDateString())
                      ? "Nothing happened on this day."
                      : "Nothing scheduled — enjoy the free time!"}
                  </Text>
                </View>
              )}
            </View>
          </MotiView>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
