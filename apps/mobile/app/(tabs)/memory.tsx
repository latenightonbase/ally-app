import React from "react";
import { ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { useAppStore } from "../../store/useAppStore";
import { MEMORY_CATEGORIES, type Memory } from "../../constants/mockData";
import { MemoryCategory } from "../../components/memory/MemoryCategory";
import { MemoryCard } from "../../components/memory/MemoryCard";
import { MemoryEmptyState } from "../../components/memory/MemoryEmptyState";

type CategoryKey = keyof typeof MEMORY_CATEGORIES;

export default function MemoryScreen() {
  const memories = useAppStore((s) => s.memories);
  const editMemory = useAppStore((s) => s.editMemory);
  const removeMemory = useAppStore((s) => s.removeMemory);
  const user = useAppStore((s) => s.user);

  const groupedMemories = (Object.keys(MEMORY_CATEGORIES) as CategoryKey[]).map(
    (key) => ({
      key,
      ...MEMORY_CATEGORIES[key],
      items: memories.filter((m) => m.category === key),
    })
  );

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top"]} className="flex-1">
        <ScrollView
          className="flex-1 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
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
              Everything {user.allyName || "Ally"} remembers about you. Full transparency — edit or
              remove anything.
            </Text>
          </MotiView>

          {/* Total memories count */}
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: 300, delay: 100 }}
            className="bg-primary-soft rounded-2xl p-4 mb-4 items-center"
          >
            <Text className="text-primary text-3xl font-sans-bold">
              {memories.length}
            </Text>
            <Text className="text-primary text-sm font-sans-medium">
              memories stored
            </Text>
          </MotiView>

          {/* Grouped memories */}
          {groupedMemories.map((group) => (
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
                    onEdit={editMemory}
                    onDelete={removeMemory}
                  />
                ))
              ) : (
                <MemoryEmptyState category={group.label} />
              )}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
