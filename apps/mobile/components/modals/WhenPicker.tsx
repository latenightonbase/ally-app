import React, { useMemo, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";

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
    if (!value) return "Pick a time";
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
      <View className="flex-row items-center mb-3">
        <Ionicons
          name="time-outline"
          size={16}
          color={theme.colors["--color-primary"]}
        />
        <Text className="text-foreground text-sm font-sans-semibold ml-2">
          {selectedLabel}
        </Text>
      </View>

      <View className="flex-row flex-wrap -mx-1 mb-2">
        {DEFAULT_PRESETS.map((preset) => {
          const built = preset.build();
          const selected =
            value !== null &&
            Math.abs(value.getTime() - built.getTime()) < 60_000;
          return (
            <Pressable
              key={preset.label}
              onPress={() => onChange(preset.build())}
              className="mx-1 mb-2 px-3 py-1.5 rounded-full border active:opacity-70"
              style={{
                backgroundColor: selected
                  ? theme.colors["--color-primary"]
                  : theme.colors["--color-surface"],
                borderColor: selected
                  ? theme.colors["--color-primary"]
                  : theme.colors["--color-primary-soft"],
              }}
            >
              <Text
                className="text-xs font-sans-semibold"
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
          className="mx-1 mb-2 px-3 py-1.5 rounded-full border border-primary-soft bg-surface active:opacity-70 flex-row items-center"
        >
          <Ionicons
            name="create-outline"
            size={12}
            color={theme.colors["--color-foreground"]}
          />
          <Text className="text-foreground text-xs font-sans-semibold ml-1">
            Custom
          </Text>
        </Pressable>
      </View>

      {customVisible && (
        <View className="bg-surface rounded-xl p-3 border border-primary-soft">
          <Text className="text-muted text-xs font-sans mb-2">
            Format: YYYY-MM-DDTHH:mm (e.g. 2026-05-01T14:30)
          </Text>
          <TextInput
            value={customText}
            onChangeText={setCustomText}
            placeholder="YYYY-MM-DDTHH:mm"
            placeholderTextColor={theme.colors["--color-muted"]}
            autoCapitalize="none"
            autoCorrect={false}
            className="bg-background border border-primary-soft rounded-lg px-3 py-2 text-foreground text-sm font-sans"
            style={{ color: theme.colors["--color-foreground"] }}
          />
          <Pressable
            onPress={handleCustomSave}
            className="self-end mt-2 px-4 py-1.5 rounded-lg bg-primary active:opacity-80"
          >
            <Text className="text-white text-xs font-sans-semibold">
              Set time
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
