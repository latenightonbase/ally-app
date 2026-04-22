import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { createTask } from "../../lib/api";
import { useFamilyStore } from "../../store/useFamilyStore";
import { SheetContainer, SheetTextInput } from "./SheetContainer";
import { WhenPicker } from "./WhenPicker";
import { FamilyMemberPicker } from "./FamilyMemberPicker";
import type { TaskPriority, TaskRecurrence } from "@ally/shared";

const PRIORITIES: TaskPriority[] = ["high", "medium", "low"];
const RECURRENCES: TaskRecurrence[] = [
  "none",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
];

interface CreateTaskSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="text-xs font-sans-bold mb-2"
      style={{
        color: "var(--color-muted)" as unknown as string,
        letterSpacing: 1.2,
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
}

export function CreateTaskSheet({
  visible,
  onClose,
  onCreated,
}: CreateTaskSheetProps) {
  const { theme } = useTheme();
  const family = useFamilyStore((s) => s.family);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [recurrence, setRecurrence] = useState<TaskRecurrence>("none");
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setTitle("");
      setDescription("");
      setDueDate(null);
      setPriority("medium");
      setRecurrence("none");
      setAssignedTo([]);
      setSubmitting(false);
    }
  }, [visible]);

  const handleToggleMember = (id: string) => {
    setAssignedTo((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    );
  };

  const canSubmit = title.trim().length > 0 && !submitting && !!family;

  const handleSubmit = async () => {
    if (!canSubmit || !family) return;
    setSubmitting(true);
    try {
      await createTask({
        familyId: family.id,
        title: title.trim(),
        description: description.trim() || undefined,
        assignedTo: assignedTo.length > 0 ? assignedTo : undefined,
        dueDate: dueDate?.toISOString(),
        priority,
        recurrence: recurrence === "none" ? undefined : recurrence,
      });
      onCreated?.();
      onClose();
    } catch (err) {
      Alert.alert(
        "Couldn't create task",
        err instanceof Error ? err.message : "Please try again.",
      );
      setSubmitting(false);
    }
  };

  const inputStyle = {
    backgroundColor: theme.colors["--color-surface"],
    borderWidth: 1.5,
    borderColor: theme.colors["--color-border"],
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: theme.colors["--color-foreground"],
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
  } as const;

  const mutedLabel = {
    color: theme.colors["--color-muted"],
    letterSpacing: 1.2,
    textTransform: "uppercase" as const,
  };

  return (
    <SheetContainer
      visible={visible}
      title="New Task"
      onClose={onClose}
      footer={
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          className="rounded-2xl items-center active:opacity-80"
          style={{
            paddingVertical: 15,
            backgroundColor: canSubmit
              ? theme.colors["--color-primary"]
              : theme.colors["--color-border"],
            shadowColor: theme.colors["--color-primary"],
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: canSubmit ? 0.3 : 0,
            shadowRadius: 18,
            elevation: canSubmit ? 4 : 0,
          }}
        >
          <Text className="text-white text-base font-sans-bold">
            {submitting ? "Saving…" : "Create Task"}
          </Text>
        </Pressable>
      }
    >
      {!family && (
        <View
          className="rounded-xl px-3 py-2 mb-4"
          style={{ backgroundColor: theme.colors["--color-primary-soft"] }}
        >
          <Text
            className="text-xs font-sans-semibold"
            style={{ color: theme.colors["--color-primary"] }}
          >
            Join or create a family to add tasks.
          </Text>
        </View>
      )}

      <View className="mb-5">
        <Text className="text-xs font-sans-bold mb-2" style={mutedLabel}>
          Task
        </Text>
        <SheetTextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Sign permission slip"
          placeholderTextColor={theme.colors["--color-muted"]}
          style={inputStyle}
        />
      </View>

      <View className="mb-5">
        <Text className="text-xs font-sans-bold mb-2" style={mutedLabel}>
          Description (optional)
        </Text>
        <SheetTextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Add extra context…"
          placeholderTextColor={theme.colors["--color-muted"]}
          multiline
          style={{
            ...inputStyle,
            minHeight: 60,
            textAlignVertical: "top",
          }}
        />
      </View>

      <View className="mb-5">
        <Text className="text-xs font-sans-bold mb-2" style={mutedLabel}>
          Due
        </Text>
        <WhenPicker value={dueDate} onChange={setDueDate} />
      </View>

      <View className="mb-5">
        <Text className="text-xs font-sans-bold mb-2" style={mutedLabel}>
          Priority
        </Text>
        <View className="flex-row flex-wrap -mx-1">
          {PRIORITIES.map((p) => {
            const selected = p === priority;
            return (
              <Pressable
                key={p}
                onPress={() => setPriority(p)}
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
                  className="text-xs font-sans-bold capitalize"
                  style={{
                    color: selected
                      ? "#fff"
                      : theme.colors["--color-foreground"],
                  }}
                >
                  {p}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="mb-5">
        <Text className="text-xs font-sans-bold mb-2" style={mutedLabel}>
          Repeat
        </Text>
        <View className="flex-row flex-wrap -mx-1">
          {RECURRENCES.map((r) => {
            const selected = r === recurrence;
            return (
              <Pressable
                key={r}
                onPress={() => setRecurrence(r)}
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
                  className="text-xs font-sans-bold capitalize"
                  style={{
                    color: selected
                      ? "#fff"
                      : theme.colors["--color-foreground"],
                  }}
                >
                  {r === "none" ? "One-off" : r}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="mb-3">
        <Text className="text-xs font-sans-bold mb-2" style={mutedLabel}>
          Assign to (optional)
        </Text>
        <FamilyMemberPicker
          selectedIds={assignedTo}
          onToggle={handleToggleMember}
        />
      </View>
    </SheetContainer>
  );
}
