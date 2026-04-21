import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { useTheme } from "../../context/ThemeContext";
import {
  addShoppingItems,
  createShoppingList,
  getShoppingLists,
} from "../../lib/api";
import { useFamilyStore } from "../../store/useFamilyStore";
import { SheetContainer } from "./SheetContainer";
import type { GroceryCategory, ShoppingList } from "@ally/shared";

const CATEGORIES: GroceryCategory[] = [
  "produce",
  "dairy",
  "meat",
  "pantry",
  "frozen",
  "household",
  "other",
];

interface AddShoppingItemSheetProps {
  visible: boolean;
  onClose: () => void;
  onAdded?: () => void;
}

export function AddShoppingItemSheet({
  visible,
  onClose,
  onAdded,
}: AddShoppingItemSheetProps) {
  const { theme } = useTheme();
  const family = useFamilyStore((s) => s.family);

  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState<GroceryCategory | null>(null);
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [listsLoading, setListsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setName("");
      setQuantity("");
      setCategory(null);
      setSubmitting(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setListsLoading(true);
      try {
        const res = await getShoppingLists();
        if (cancelled) return;
        setLists(res.lists);
        if (res.lists.length > 0) {
          setSelectedListId(res.lists[0].id);
        }
      } catch (err) {
        console.warn("[AddShoppingItemSheet] Failed to load lists", err);
      } finally {
        if (!cancelled) setListsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const canSubmit = useMemo(
    () => name.trim().length > 0 && !!family && !submitting,
    [name, family, submitting],
  );

  const handleSubmit = async () => {
    if (!canSubmit || !family) return;
    setSubmitting(true);
    try {
      let listId = selectedListId;
      if (!listId) {
        const { list } = await createShoppingList("Groceries");
        listId = list.id;
        setLists((curr) => [...curr, list]);
        setSelectedListId(listId);
      }

      await addShoppingItems(listId, [
        {
          listId,
          name: name.trim(),
          quantity: quantity.trim() || undefined,
          category: category ?? undefined,
        },
      ]);

      onAdded?.();
      onClose();
    } catch (err) {
      Alert.alert(
        "Couldn't add item",
        err instanceof Error ? err.message : "Please try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <SheetContainer
      visible={visible}
      title="Add to shopping"
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
            {submitting ? "Adding…" : "Add to list"}
          </Text>
        </Pressable>
      }
    >
      {!family && (
        <Text className="text-muted text-xs font-sans mb-3">
          Join or create a family to manage shopping.
        </Text>
      )}

      {lists.length > 1 && (
        <View className="mb-4">
          <Text className="text-foreground text-xs font-sans-semibold mb-2">
            List
          </Text>
          <View className="flex-row flex-wrap -mx-1">
            {lists.map((list) => {
              const selected = list.id === selectedListId;
              return (
                <Pressable
                  key={list.id}
                  onPress={() => setSelectedListId(list.id)}
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
                    {list.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View className="mb-4">
        <Text className="text-foreground text-xs font-sans-semibold mb-2">
          Item
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Cheddar cheese"
          placeholderTextColor={theme.colors["--color-muted"]}
          className="bg-surface border border-primary-soft rounded-xl px-4 py-3 text-foreground text-sm font-sans"
          style={{ color: theme.colors["--color-foreground"] }}
          autoFocus
        />
      </View>

      <View className="mb-4">
        <Text className="text-foreground text-xs font-sans-semibold mb-2">
          Quantity (optional)
        </Text>
        <TextInput
          value={quantity}
          onChangeText={setQuantity}
          placeholder="e.g. 2 blocks"
          placeholderTextColor={theme.colors["--color-muted"]}
          className="bg-surface border border-primary-soft rounded-xl px-4 py-3 text-foreground text-sm font-sans"
          style={{ color: theme.colors["--color-foreground"] }}
        />
      </View>

      <View className="mb-2">
        <Text className="text-foreground text-xs font-sans-semibold mb-2">
          Category (optional)
        </Text>
        <View className="flex-row flex-wrap -mx-1">
          {CATEGORIES.map((c) => {
            const selected = c === category;
            return (
              <Pressable
                key={c}
                onPress={() => setCategory(selected ? null : c)}
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
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SheetContainer>
  );
}
