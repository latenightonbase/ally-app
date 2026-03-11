import React, { useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator } from "react-native";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../context/ThemeContext";

export interface MemoryItem {
  id: string;
  text: string;
  category: string;
  createdAt: Date;
}

interface MemoryCardProps {
  memory: MemoryItem;
  index: number;
  onEdit: (id: string, text: string) => Promise<void>;
  onDelete: (id: string) => void;
}

export function MemoryCard({
  memory,
  index,
  onEdit,
  onDelete,
}: MemoryCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(memory.text);
  const [isSaving, setIsSaving] = useState(false);
  const { theme } = useTheme();

  const primaryColor = theme.colors["--color-primary"];
  const muteColor = theme.colors["--color-muted"];
  const dangerColor = theme.colors["--color-danger"];

  const handleSaveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === memory.text) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await onEdit(memory.id, trimmed);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditText(memory.text);
    setIsEditing(false);
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDelete(memory.id);
  };

  return (
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        type: "timing",
        duration: 300,
        delay: index * 80,
      }}
    >
      <View className="bg-surface rounded-2xl p-4 mb-2.5 flex-row items-center">
        {isEditing ? (
          <View className="flex-1 flex-row items-center">
            <TextInput
              value={editText}
              onChangeText={setEditText}
              className="flex-1 text-foreground font-sans text-base bg-background rounded-xl px-3 py-2 mr-2"
              style={{ color: theme.colors["--color-foreground"] }}
              autoFocus
              multiline
              maxLength={1000}
              editable={!isSaving}
            />
            <View className="flex-row">
              {isSaving ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : (
                <>
                  <Pressable onPress={handleSaveEdit} className="p-2">
                    <Ionicons
                      name="checkmark-circle"
                      size={24}
                      color={primaryColor}
                    />
                  </Pressable>
                  <Pressable onPress={handleCancelEdit} className="p-2">
                    <Ionicons
                      name="close-circle-outline"
                      size={24}
                      color={muteColor}
                    />
                  </Pressable>
                </>
              )}
            </View>
          </View>
        ) : (
          <>
            <Text className="text-foreground text-base font-sans flex-1 leading-6">
              {memory.text}
            </Text>
            <View className="flex-row ml-3">
              <Pressable
                onPress={() => {
                  setEditText(memory.text);
                  setIsEditing(true);
                }}
                className="p-1.5 mr-1"
              >
                <Ionicons name="pencil-outline" size={18} color={muteColor} />
              </Pressable>
              <Pressable onPress={handleDelete} className="p-1.5">
                <Ionicons name="trash-outline" size={18} color={dangerColor} />
              </Pressable>
            </View>
          </>
        )}
      </View>
    </MotiView>
  );
}
