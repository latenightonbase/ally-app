import * as Calendar from "expo-calendar";
import { Platform, Alert } from "react-native";

// ---------------------------------------------------------------------------
// Calendar helper – request access, find a writable calendar, create events
// ---------------------------------------------------------------------------

/**
 * Request calendar permission from the user.
 * Returns `true` if permission is granted, `false` otherwise.
 */
export async function requestCalendarAccess(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      "Calendar Permission",
      "Ally needs calendar access to add events. You can enable this in Settings.",
    );
    return false;
  }
  return true;
}

/**
 * Find the best writable calendar for the current platform.
 * - iOS: default calendar from the system, or the first writable local/caldav calendar.
 * - Android: first primary calendar, or first writable local calendar.
 */
export async function getDefaultCalendarId(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(
    Calendar.EntityTypes.EVENT,
  );

  if (Platform.OS === "ios") {
    const defaultCal = await Calendar.getDefaultCalendarAsync();
    if (defaultCal?.id) return defaultCal.id;
  }

  // Find the first writable calendar
  const writable = calendars.find(
    (c) =>
      c.allowsModifications &&
      (c.type === Calendar.CalendarType.LOCAL ||
        c.type === Calendar.CalendarType.CALDAV ||
        // Android uses "source" based calendars — pick primary
        (c as any).isPrimary),
  );

  if (writable) return writable.id;

  // Fallback: any writable calendar
  const anyWritable = calendars.find((c) => c.allowsModifications);
  return anyWritable?.id ?? null;
}

export interface AddToCalendarInput {
  title: string;
  startDate: string; // ISO string
  durationMinutes?: number;
  notes?: string;
  timezone?: string;
}

/**
 * Create a calendar event for a reminder.
 * Returns the native event ID on success, or `null` on failure.
 */
export async function addReminderToCalendar(
  input: AddToCalendarInput,
): Promise<string | null> {
  const hasAccess = await requestCalendarAccess();
  if (!hasAccess) return null;

  const calendarId = await getDefaultCalendarId();
  if (!calendarId) {
    Alert.alert(
      "No Calendar Found",
      "Couldn't find a writable calendar on your device.",
    );
    return null;
  }

  const start = new Date(input.startDate);
  const durationMs = (input.durationMinutes ?? 30) * 60_000;
  const end = new Date(start.getTime() + durationMs);

  try {
    const eventId = await Calendar.createEventAsync(calendarId, {
      title: input.title,
      startDate: start,
      endDate: end,
      notes: input.notes,
      timeZone: input.timezone,
      alarms: [{ relativeOffset: -10 }], // 10 min before
    });

    return eventId;
  } catch (err) {
    console.error("[calendar] Failed to create event:", err);
    Alert.alert("Calendar Error", "Something went wrong adding the event.");
    return null;
  }
}
