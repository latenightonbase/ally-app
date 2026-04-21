import React from "react";
import { View, Text, Pressable } from "react-native";
import { useFamilyStore } from "../../store/useFamilyStore";
import { useTheme } from "../../context/ThemeContext";
import type { FamilyMember } from "@ally/shared";

interface FamilyMemberPickerProps {
  selectedIds: string[];
  onToggle: (memberId: string) => void;
  emptyHint?: string;
  members?: Pick<FamilyMember, "id" | "name" | "color">[];
}

export function FamilyMemberPicker({
  selectedIds,
  onToggle,
  emptyHint,
  members,
}: FamilyMemberPickerProps) {
  const storeMembers = useFamilyStore((s) => s.members);
  const list = members ?? storeMembers;
  const { theme } = useTheme();

  if (list.length === 0) {
    return (
      <Text className="text-muted text-xs font-sans">
        {emptyHint ?? "Add family members first to mention them."}
      </Text>
    );
  }

  return (
    <View className="flex-row flex-wrap -mx-1">
      {list.map((member) => {
        const selected = selectedIds.includes(member.id);
        return (
          <Pressable
            key={member.id}
            onPress={() => onToggle(member.id)}
            className="mx-1 mb-2 px-3 py-2 rounded-full border flex-row items-center active:opacity-70"
            style={{
              backgroundColor: selected
                ? theme.colors["--color-primary"]
                : theme.colors["--color-surface"],
              borderColor: selected
                ? theme.colors["--color-primary"]
                : theme.colors["--color-primary-soft"],
            }}
          >
            <View
              className="w-2 h-2 rounded-full mr-2"
              style={{
                backgroundColor:
                  member.color ?? theme.colors["--color-primary"],
              }}
            />
            <Text
              className="text-xs font-sans-semibold"
              style={{
                color: selected
                  ? "#fff"
                  : theme.colors["--color-foreground"],
              }}
            >
              {member.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
