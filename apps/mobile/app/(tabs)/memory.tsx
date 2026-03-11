import React, { useEffect, useState, useCallback } from "react";
import { ScrollView, View, Text, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { useAppStore } from "../../store/useAppStore";
import { MemoryCategory } from "../../components/memory/MemoryCategory";
import { MemoryCard } from "../../components/memory/MemoryCard";
import { MemoryEmptyState } from "../../components/memory/MemoryEmptyState";
import {
  getMemoryFacts,
  deleteMemoryFact,
  updateMemoryFact,
  type MemoryFactItem,
} from "../../lib/api";

const MEMORY_CATEGORIES = {
  personal_info: { label: "Personal Info", emoji: "👤" },
  relationships: { label: "Relationships", emoji: "❤️" },
  work: { label: "Work", emoji: "💼" },
  health: { label: "Health", emoji: "🏃" },
  interests: { label: "Interests", emoji: "⭐" },
  goals: { label: "Goals", emoji: "🎯" },
  emotional_patterns: { label: "Emotional Patterns", emoji: "🧠" },
} as const;

type CategoryKey = keyof typeof MEMORY_CATEGORIES;

interface MemoryForCard {
  id: string;
  category: string;
  text: string;
  createdAt: Date;
}

export default function MemoryScreen() {
  const user = useAppStore((s) => s.user);
  const [facts, setFacts] = useState<MemoryFactItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFacts = useCallback(async () => {
    try {
      setLoading(true);
      const { facts: fetchedFacts } = await getMemoryFacts(undefined, 100, 0);
      setFacts(fetchedFacts);
    } catch {
      // silently fail — show empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFacts();
  }, [loadFacts]);

  const handleEdit = useCallback(async (id: string, content: string) => {
    try {
      await updateMemoryFact(id, content);
      setFacts((prev) =>
        prev.map((f) => (f.id === id ? { ...f, content } : f)),
      );
    } catch {
      Alert.alert("Error", "Could not save changes. Please try again.");
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteMemoryFact(id);
      setFacts((prev) => prev.filter((f) => f.id !== id));
    } catch {
      Alert.alert("Error", "Could not delete memory.");
    }
  }, []);

  const groupedMemories = (
    Object.keys(MEMORY_CATEGORIES) as CategoryKey[]
  ).map((key) => ({
    key,
    ...MEMORY_CATEGORIES[key],
    items: facts
      .filter((f) => f.category === key)
      .map(
        (f): MemoryForCard => ({
          id: f.id,
          category: f.category,
          text: f.content,
          createdAt: new Date(f.sourceDate ?? Date.now()),
        }),
      ),
  }));

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top"]} className="flex-1">
        <ScrollView
          className="flex-1 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: 300 }}
            className="mb-4"
          >
            <Text className="text-foreground text-2xl font-sans-bold mb-1">
              Memory Vault
            </Text>
            <Text className="text-muted text-sm font-sans">
              Everything {user.allyName || "Ally"} remembers about you. Full
              transparency — edit or remove anything.
            </Text>
          </MotiView>

          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: 300, delay: 100 }}
            className="bg-primary-soft rounded-2xl p-4 mb-4 items-center"
          >
            <Text className="text-primary text-3xl font-sans-bold">
              {facts.length}
            </Text>
            <Text className="text-primary text-sm font-sans-medium">
              memories stored
            </Text>
          </MotiView>

          {loading ? (
            <ActivityIndicator size="large" className="mt-8" />
          ) : (
            groupedMemories.map((group) => (
              <View key={group.key}>
                <MemoryCategory
                  label={group.label}
                  emoji={group.emoji}
                  count={group.items.length}
                />
                {group.items.length > 0 ? (
                  group.items.map((memory, index) => (
                    <MemoryCard
                      key={memory.id}
                      memory={memory}
                      index={index}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))
                ) : (
                  <MemoryEmptyState category={group.label} />
                )}
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
