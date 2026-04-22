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
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { AddFab } from "../../components/ui/AddFab";
import { CreateReminderSheet } from "../../components/modals/CreateReminderSheet";
import { CreateTaskSheet } from "../../components/modals/CreateTaskSheet";
import type { CalendarEvent, Task } from "@ally/shared";

type DashboardReminder = {
  id: string;
  title: string;
  body: string | null;
  remindAt: string;
  targetMemberIds?: string[] | null;
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
  const accentColor = item.color ?? theme.colors["--color-primary"];

  return (
    <View
      className="rounded-2xl mb-2.5 overflow-hidden"
      style={{
        backgroundColor: theme.colors["--color-surface"],
        borderWidth: 1,
        borderColor: theme.colors["--color-border"],
      }}
    >
      <View className="flex-row items-center px-4 py-3.5">
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.colors["--color-primary-soft"],
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Ionicons name={iconName} size={18} color={accentColor} />
        </View>
        <View className="flex-1">
          <Text
            className="text-base font-sans-bold"
            style={{
              color: isCompleted
                ? theme.colors["--color-muted"]
                : theme.colors["--color-foreground"],
              textDecorationLine: isCompleted ? "line-through" : "none",
            }}
          >
            {item.title}
          </Text>
          <Text
            className="text-xs font-sans mt-0.5"
            style={{ color: theme.colors["--color-muted"] }}
          >
            {item.allDay ? "All day" : formatTime(item.time)}
            {item.location ? ` · ${item.location}` : ""}
            {item.subtitle ? ` · ${item.subtitle}` : ""}
          </Text>
          {item.assignedNames && item.assignedNames.length > 0 && (
            <View className="flex-row flex-wrap mt-1.5">
              {item.assignedNames.map((name, i) => (
                <Text
                  key={i}
                  className="text-xs font-sans-semibold mr-2"
                  style={{ color: theme.colors["--color-faint"] }}
                >
                  {name}
                </Text>
              ))}
            </View>
          )}
        </View>
        <View
          style={{
            width: 4,
            alignSelf: "stretch",
            backgroundColor: accentColor,
            borderRadius: 2,
            marginLeft: 12,
          }}
        />
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
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);

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
      const assigneeIds = Array.isArray(task.assignedTo)
        ? task.assignedTo
        : [];
      const assigneeNames = assigneeIds
        .map((id) => memberMap.get(id))
        .filter(Boolean) as string[];
      push(key, {
        id: `task-${task.id}`,
        kind: "task",
        title: task.title,
        time: date,
        subtitle: assigneeNames.join(", ") || undefined,
        status: task.status,
      });
    }

    for (const reminder of reminders) {
      const date = new Date(reminder.remindAt);
      const key = toDateKey(date);
      const ids = Array.isArray(reminder.targetMemberIds)
        ? reminder.targetMemberIds
        : [];
      const assigneeNames = ids
        .map((id) => memberMap.get(id))
        .filter(Boolean) as string[];
      push(key, {
        id: `reminder-${reminder.id}`,
        kind: "reminder",
        title: reminder.title,
        time: date,
        subtitle: assigneeNames.join(", ") || reminder.body || undefined,
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
      backgroundColor: theme.colors["--color-surface"],
      calendarBackground: theme.colors["--color-surface"],
      textSectionTitleColor: theme.colors["--color-muted"],
      selectedDayBackgroundColor: theme.colors["--color-primary"],
      selectedDayTextColor: "#ffffff",
      todayTextColor: theme.colors["--color-primary"],
      todayBackgroundColor: theme.colors["--color-primary-soft"],
      dayTextColor: theme.colors["--color-foreground"],
      textDisabledColor: theme.colors["--color-faint"],
      monthTextColor: theme.colors["--color-foreground"],
      arrowColor: theme.colors["--color-primary"],
      textMonthFontFamily: "Nunito_700Bold",
      textDayFontFamily: "Nunito_600SemiBold",
      textDayHeaderFontFamily: "Nunito_700Bold",
      textMonthFontSize: 18,
      textDayFontSize: 14,
      textDayHeaderFontSize: 11,
    }),
    [theme],
  );

  if (loading) {
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
          <ScreenHeader title="Calendar" />
          <View className="flex-1 px-5 items-center justify-center">
            <Ionicons
              name="calendar-outline"
              size={48}
              color={theme.colors["--color-muted"]}
            />
            <Text
              className="text-sm font-sans text-center mt-3"
              style={{ color: theme.colors["--color-muted"] }}
            >
              Join or create a family to see the shared calendar.
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
        <ScreenHeader
          title="Calendar"
          subtitle={family?.name ?? dashboard?.family?.name ?? `${user.name}'s Family`}
          rightSlot={
            !isToday ? (
              <TouchableOpacity
                onPress={() => setSelectedDate(toDateKey(new Date()))}
                className="rounded-full px-3 py-1.5 flex-row items-center mr-2"
                activeOpacity={0.7}
                style={{
                  backgroundColor: theme.colors["--color-primary"],
                  shadowColor: theme.colors["--color-primary"],
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                <Ionicons name="today-outline" size={13} color="#ffffff" />
                <Text className="text-white text-xs font-sans-bold ml-1">
                  Today
                </Text>
              </TouchableOpacity>
            ) : null
          }
        />
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
            <View
              className="mx-5 mb-3 rounded-3xl overflow-hidden"
              style={{
                backgroundColor: theme.colors["--color-surface"],
                borderWidth: 1,
                borderColor: theme.colors["--color-border"],
                paddingVertical: 8,
              }}
            >
              <Calendar
                current={selectedDate}
                onDayPress={(day) => setSelectedDate(day.dateString)}
                markingType="multi-dot"
                markedDates={markedDates}
                theme={calendarTheme as never}
                enableSwipeMonths
                firstDay={0}
              />
            </View>

            <View className="px-5 mb-4 flex-row flex-wrap">
              <View className="flex-row items-center mr-4 mb-1">
                <View
                  className="w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: theme.colors["--color-primary"] }}
                />
                <Text
                  className="text-xs font-sans-semibold"
                  style={{ color: theme.colors["--color-muted"] }}
                >
                  Events
                </Text>
              </View>
              <View className="flex-row items-center mr-4 mb-1">
                <View
                  className="w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: theme.colors["--color-accent"] }}
                />
                <Text
                  className="text-xs font-sans-semibold"
                  style={{ color: theme.colors["--color-muted"] }}
                >
                  Reminders
                </Text>
              </View>
              <View className="flex-row items-center mr-4 mb-1">
                <View
                  className="w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: theme.colors["--color-secondary"] }}
                />
                <Text
                  className="text-xs font-sans-semibold"
                  style={{ color: theme.colors["--color-muted"] }}
                >
                  Tasks
                </Text>
              </View>
            </View>

            <View className="px-5 mt-1">
              <Text
                className="text-lg font-sans-bold"
                style={{ color: theme.colors["--color-foreground"] }}
              >
                {selectedDateObj.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
              <Text
                className="text-xs font-sans mb-3"
                style={{ color: theme.colors["--color-muted"] }}
              >
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
                <View
                  className="rounded-3xl p-6 items-center"
                  style={{
                    backgroundColor: theme.colors["--color-surface"],
                    borderWidth: 1,
                    borderColor: theme.colors["--color-border"],
                  }}
                >
                  <Ionicons
                    name="sunny-outline"
                    size={32}
                    color={theme.colors["--color-muted"]}
                  />
                  <Text
                    className="text-sm font-sans mt-2 text-center"
                    style={{ color: theme.colors["--color-muted"] }}
                  >
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
    </View>
  );
}
