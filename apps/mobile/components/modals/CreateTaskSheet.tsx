import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { createTask } from "../../lib/api";
import { useFamilyStore } from "../../store/useFamilyStore";
import { SheetContainer } from "./SheetContainer";
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

  return (
    <SheetContainer
      visible={visible}
      title="New task"
      onClose={onClose}
      footer={
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          className="rounded-xl py-3.5 items-center active:opacity-80"
          style={{
            backgroundColor: canSubmit
              ? theme.colors["--color-primary"]
              : theme.colors["--color-muted"] + "40",
          }}
        >
          <Text className="text-white text-base font-sans-bold">
            {submitting ? "Saving…" : "Create task"}
          </Text>
        </Pressable>
      }
    >
      {!family && (
        <Text className="text-muted text-xs font-sans mb-3">
          Join or create a family to add tasks.
        </Text>
      )}

      <View className="mb-4">
        <Text className="text-foreground text-xs font-sans-semibold mb-2">
          Task
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Sign permission slip"
          placeholderTextColor={theme.colors["--color-muted"]}
          className="bg-surface border border-primary-soft rounded-xl px-4 py-3 text-foreground text-sm font-sans"
          style={{ color: theme.colors["--color-foreground"] }}
          autoFocus
        />
      </View>

      <View className="mb-4">
        <Text className="text-foreground text-xs font-sans-semibold mb-2">
          Description (optional)
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Add extra context…"
          placeholderTextColor={theme.colors["--color-muted"]}
          multiline
          className="bg-surface border border-primary-soft rounded-xl px-4 py-3 text-foreground text-sm font-sans"
          style={{
            color: theme.colors["--color-foreground"],
            minHeight: 60,
            textAlignVertical: "top",
          }}
        />
      </View>

      <View className="mb-4">
        <Text className="text-foreground text-xs font-sans-semibold mb-2">
          Due
        </Text>
        <WhenPicker value={dueDate} onChange={setDueDate} />
      </View>

      <View className="mb-4">
        <Text className="text-foreground text-xs font-sans-semibold mb-2">
          Priority
        </Text>
        <View className="flex-row -mx-1">
          {PRIORITIES.map((p) => {
            const selected = p === priority;
            return (
              <Pressable
                key={p}
                onPress={() => setPriority(p)}
                className="mx-1 px-3 py-1.5 rounded-full border active:opacity-70"
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
                  className="text-xs font-sans-semibold capitalize"
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

      <View className="mb-4">
        <Text className="text-foreground text-xs font-sans-semibold mb-2">
          Repeat
        </Text>
        <View className="flex-row flex-wrap -mx-1">
          {RECURRENCES.map((r) => {
            const selected = r === recurrence;
            return (
              <Pressable
                key={r}
                onPress={() => setRecurrence(r)}
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
                  className="text-xs font-sans-semibold capitalize"
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

      <View className="mb-2">
        <Text className="text-foreground text-xs font-sans-semibold mb-2">
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
