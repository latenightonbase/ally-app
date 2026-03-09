import React, { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

interface MemoryItem {
  id: string;
  text: string;
  category: string;
  createdAt: Date;
}

interface MemoryCardProps {
  memory: MemoryItem;
  index: number;
  onEdit: (id: string, text: string) => void;
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

  const handleSaveEdit = () => {
    if (editText.trim()) {
      onEdit(memory.id, editText.trim());
    }
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
              autoFocus
              onSubmitEditing={handleSaveEdit}
            />
            <Pressable onPress={handleSaveEdit} className="p-2">
              <Ionicons name="checkmark-circle" size={24} color="#7C9A72" />
            </Pressable>
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
                <Ionicons name="pencil-outline" size={18} color="#9C9589" />
              </Pressable>
              <Pressable onPress={handleDelete} className="p-1.5">
                <Ionicons name="trash-outline" size={18} color="#C75D5D" />
              </Pressable>
            </View>
          </>
        )}
      </View>
    </MotiView>
  );
}
