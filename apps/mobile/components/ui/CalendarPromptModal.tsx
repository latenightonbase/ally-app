import React, { useCallback, useState } from "react";
import { Modal, Pressable, Text, View, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../context/ThemeContext";
import { useAppStore, type CalendarPromptData } from "../../store/useAppStore";
import { addReminderToCalendar } from "../../lib/useCalendar";

// ---------------------------------------------------------------------------
// CalendarPromptModal
// Shown globally (rendered in _layout.tsx) whenever a reminder notification
// arrives. Asks the user "Should I add this to your calendar?" with
// Add / No thanks buttons.
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function CalendarPromptModal() {
  const { theme } = useTheme();
  const prompt = useAppStore((s) => s.pendingCalendarPrompt);
  const clearPrompt = useAppStore((s) => s.clearPendingCalendarPrompt);
  const [loading, setLoading] = useState(false);

  const handleAdd = useCallback(async () => {
    if (!prompt) return;
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const eventId = await addReminderToCalendar({
      title: prompt.title,
      startDate: prompt.startDate,
      durationMinutes: prompt.durationMinutes,
      notes: prompt.body,
      timezone: prompt.timezone,
    });

    setLoading(false);

    if (eventId) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    clearPrompt();
  }, [prompt, clearPrompt]);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearPrompt();
  }, [clearPrompt]);

  if (!prompt) return null;

  return (
    <Modal
      visible={!!prompt}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <Pressable
        className="flex-1 bg-foreground/40 justify-end"
        onPress={handleDismiss}
      >
        {/* Inner pressable stops propagation so tapping the sheet doesn't dismiss */}
        <Pressable onPress={() => {}}>
          <View
            className="rounded-t-3xl px-6 pt-6 pb-10"
            style={{ backgroundColor: theme.colors["--color-surface"] }}
          >
            {/* Icon */}
            <View className="items-center mb-3">
              <View
                className="w-14 h-14 rounded-full items-center justify-center"
                style={{ backgroundColor: theme.colors["--color-primary-soft"] }}
              >
                <Ionicons
                  name="calendar-outline"
                  size={28}
                  color={theme.colors["--color-primary"]}
                />
              </View>
            </View>

            {/* Title */}
            <Text
              className="text-center text-lg font-sans-bold mb-1"
              style={{ color: theme.colors["--color-foreground"] }}
            >
              Add to your calendar?
            </Text>

            {/* Subtitle / event info */}
            <Text
              className="text-center text-base font-sans mb-1"
              style={{ color: theme.colors["--color-foreground"] }}
            >
              {prompt.title}
            </Text>
            <Text
              className="text-center text-sm font-sans mb-5"
              style={{ color: theme.colors["--color-muted"] }}
            >
              {formatDate(prompt.startDate)}
              {prompt.durationMinutes
                ? `  ·  ${prompt.durationMinutes} min`
                : ""}
            </Text>

            {/* Buttons */}
            <View className="flex-row gap-3">
              <Pressable
                onPress={handleDismiss}
                className="flex-1 py-3.5 rounded-2xl items-center active:opacity-70"
                style={{
                  backgroundColor: theme.colors["--color-primary-soft"],
                }}
              >
                <Text
                  className="font-sans-semibold"
                  style={{ color: theme.colors["--color-primary"] }}
                >
                  No thanks
                </Text>
              </Pressable>

              <Pressable
                onPress={handleAdd}
                disabled={loading}
                className="flex-1 py-3.5 rounded-2xl items-center active:opacity-70"
                style={{
                  backgroundColor: theme.colors["--color-primary"],
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors["--color-background"]}
                  />
                ) : (
                  <Text
                    className="font-sans-semibold"
                    style={{ color: theme.colors["--color-background"] }}
                  >
                    Add to Calendar
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
