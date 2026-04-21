import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { createReminder } from "../../lib/api";
import { SheetContainer } from "./SheetContainer";
import { WhenPicker } from "./WhenPicker";
import { FamilyMemberPicker } from "./FamilyMemberPicker";

interface CreateReminderSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function CreateReminderSheet({
  visible,
  onClose,
  onCreated,
}: CreateReminderSheetProps) {
  const { theme } = useTheme();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [remindAt, setRemindAt] = useState<Date | null>(null);
  const [targetMemberIds, setTargetMemberIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setTitle("");
      setBody("");
      setRemindAt(null);
      setTargetMemberIds([]);
      setSubmitting(false);
    }
  }, [visible]);

  const handleToggleMember = (id: string) => {
    setTargetMemberIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    );
  };

  const canSubmit = title.trim().length > 0 && remindAt !== null && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !remindAt) return;
    setSubmitting(true);
    try {
      await createReminder({
        title: title.trim(),
        body: body.trim() || undefined,
        remindAt: remindAt.toISOString(),
        targetMemberIds: targetMemberIds.length > 0 ? targetMemberIds : undefined,
      });
      onCreated?.();
      onClose();
    } catch (err) {
      Alert.alert(
        "Couldn't create reminder",
        err instanceof Error ? err.message : "Please try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <SheetContainer
      visible={visible}
      title="New reminder"
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
            {submitting ? "Saving…" : "Create reminder"}
          </Text>
        </Pressable>
      }
    >
      <View className="mb-4">
        <Text className="text-foreground text-xs font-sans-semibold mb-2">
          What should I remind about?
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Pick up cheese on the way home"
          placeholderTextColor={theme.colors["--color-muted"]}
          className="bg-surface border border-primary-soft rounded-xl px-4 py-3 text-foreground text-sm font-sans"
          style={{ color: theme.colors["--color-foreground"] }}
          autoFocus
        />
      </View>

      <View className="mb-4">
        <Text className="text-foreground text-xs font-sans-semibold mb-2">
          Notes (optional)
        </Text>
        <TextInput
          value={body}
          onChangeText={setBody}
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
          When?
        </Text>
        <WhenPicker value={remindAt} onChange={setRemindAt} />
      </View>

      <View className="mb-2">
        <Text className="text-foreground text-xs font-sans-semibold mb-2">
          Mention family members (optional)
        </Text>
        <FamilyMemberPicker
          selectedIds={targetMemberIds}
          onToggle={handleToggleMember}
          emptyHint="Join or create a family to mention members."
        />
      </View>
    </SheetContainer>
  );
}
