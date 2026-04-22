import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { createReminder } from "../../lib/api";
import { SheetContainer, SheetTextInput } from "./SheetContainer";
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
      title="New Reminder"
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
            {submitting ? "Saving…" : "Create Reminder"}
          </Text>
        </Pressable>
      }
    >
      <View className="mb-5">
        <Text className="text-xs font-sans-bold mb-2" style={mutedLabel}>
          What should I remind about?
        </Text>
        <SheetTextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Pick up cheese on the way home"
          placeholderTextColor={theme.colors["--color-muted"]}
          style={inputStyle}
        />
      </View>

      <View className="mb-5">
        <Text className="text-xs font-sans-bold mb-2" style={mutedLabel}>
          Notes (optional)
        </Text>
        <SheetTextInput
          value={body}
          onChangeText={setBody}
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
          When?
        </Text>
        <WhenPicker value={remindAt} onChange={setRemindAt} />
      </View>

      <View className="mb-3">
        <Text className="text-xs font-sans-bold mb-2" style={mutedLabel}>
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
