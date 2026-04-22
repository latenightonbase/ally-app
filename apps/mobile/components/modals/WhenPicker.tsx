import React, { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { SheetTextInput } from "./SheetContainer";

interface Preset {
  label: string;
  build: () => Date;
}

function atHour(base: Date, hour: number): Date {
  const d = new Date(base);
  d.setHours(hour, 0, 0, 0);
  return d;
}

const DEFAULT_PRESETS: Preset[] = [
  {
    label: "In 1 hour",
    build: () => new Date(Date.now() + 60 * 60 * 1000),
  },
  {
    label: "Tonight 8pm",
    build: () => atHour(new Date(), 20),
  },
  {
    label: "Tomorrow 9am",
    build: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return atHour(d, 9);
    },
  },
  {
    label: "Tomorrow 6pm",
    build: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return atHour(d, 18);
    },
  },
  {
    label: "This weekend",
    build: () => {
      const d = new Date();
      const dayOfWeek = d.getDay();
      const daysUntilSat = (6 - dayOfWeek + 7) % 7 || 1;
      d.setDate(d.getDate() + daysUntilSat);
      return atHour(d, 10);
    },
  },
  {
    label: "Next week",
    build: () => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return atHour(d, 9);
    },
  },
];

function formatLocal(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface WhenPickerProps {
  value: Date | null;
  onChange: (next: Date) => void;
}

export function WhenPicker({ value, onChange }: WhenPickerProps) {
  const { theme } = useTheme();
  const [customVisible, setCustomVisible] = useState(false);
  const [customText, setCustomText] = useState(
    value ? toDatetimeLocalValue(value) : "",
  );

  const selectedLabel = useMemo(() => {
    if (!value) return null;
    return formatLocal(value);
  }, [value]);

  const handleCustomSave = () => {
    const parsed = new Date(customText);
    if (!Number.isNaN(parsed.getTime())) {
      onChange(parsed);
      setCustomVisible(false);
    }
  };

  return (
    <View>
      {selectedLabel && (
        <View
          className="flex-row items-center mb-3 rounded-2xl px-3.5 py-2.5"
          style={{
            backgroundColor: theme.colors["--color-primary-soft"],
            borderWidth: 1,
            borderColor: theme.colors["--color-primary-soft"],
          }}
        >
          <Ionicons
            name="time-outline"
            size={16}
            color={theme.colors["--color-primary"]}
          />
          <Text
            className="text-sm font-sans-semibold ml-2"
            style={{ color: theme.colors["--color-primary"] }}
          >
            {selectedLabel}
          </Text>
        </View>
      )}

      <View className="flex-row flex-wrap -mx-1">
        {DEFAULT_PRESETS.map((preset) => {
          const built = preset.build();
          const selected =
            value !== null &&
            Math.abs(value.getTime() - built.getTime()) < 60_000;
          return (
            <Pressable
              key={preset.label}
              onPress={() => onChange(preset.build())}
              className="mx-1 mb-2 px-3.5 py-2 rounded-full active:opacity-80"
              style={{
                backgroundColor: selected
                  ? theme.colors["--color-primary"]
                  : theme.colors["--color-surface"],
                borderWidth: 1.5,
                borderColor: selected
                  ? theme.colors["--color-primary"]
                  : theme.colors["--color-border"],
              }}
            >
              <Text
                className="text-xs font-sans-bold"
                style={{
                  color: selected
                    ? "#fff"
                    : theme.colors["--color-foreground"],
                }}
              >
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setCustomVisible((v) => !v)}
          className="mx-1 mb-2 px-3.5 py-2 rounded-full active:opacity-80 flex-row items-center"
          style={{
            backgroundColor: customVisible
              ? theme.colors["--color-primary-soft"]
              : theme.colors["--color-surface"],
            borderWidth: 1.5,
            borderColor: customVisible
              ? theme.colors["--color-primary"]
              : theme.colors["--color-border"],
          }}
        >
          <Ionicons
            name="create-outline"
            size={12}
            color={
              customVisible
                ? theme.colors["--color-primary"]
                : theme.colors["--color-muted"]
            }
          />
          <Text
            className="text-xs font-sans-bold ml-1"
            style={{
              color: customVisible
                ? theme.colors["--color-primary"]
                : theme.colors["--color-muted"],
            }}
          >
            Custom
          </Text>
        </Pressable>
      </View>

      {customVisible && (
        <View
          className="rounded-2xl p-3.5 mt-1"
          style={{
            backgroundColor: theme.colors["--color-surface"],
            borderWidth: 1,
            borderColor: theme.colors["--color-border"],
          }}
        >
          <Text
            className="text-xs font-sans mb-2"
            style={{ color: theme.colors["--color-muted"] }}
          >
            Format: YYYY-MM-DDTHH:mm
          </Text>
          <View className="flex-row items-center">
            <SheetTextInput
              value={customText}
              onChangeText={setCustomText}
              placeholder="2026-05-01T14:30"
              placeholderTextColor={theme.colors["--color-muted"]}
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                flex: 1,
                backgroundColor: theme.colors["--color-background"],
                borderWidth: 1.5,
                borderColor: theme.colors["--color-border"],
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: theme.colors["--color-foreground"],
                fontSize: 13,
                fontFamily: "Nunito_600SemiBold",
              }}
            />
            <Pressable
              onPress={handleCustomSave}
              className="ml-2 px-4 py-2.5 rounded-xl active:opacity-80"
              style={{ backgroundColor: theme.colors["--color-primary"] }}
            >
              <Text className="text-white text-xs font-sans-bold">Set</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
