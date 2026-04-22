import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { useTheme } from "../../context/ThemeContext";
import {
  addShoppingItems,
  createShoppingList,
  getShoppingLists,
} from "../../lib/api";
import { useFamilyStore } from "../../store/useFamilyStore";
import { SheetContainer, SheetTextInput } from "./SheetContainer";
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
  const [, setListsLoading] = useState(false);
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
      title="Add to Shopping"
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
            {submitting ? "Adding…" : "Add to List"}
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
            Join or create a family to manage shopping.
          </Text>
        </View>
      )}

      {lists.length > 1 && (
        <View className="mb-5">
          <Text className="text-xs font-sans-bold mb-2" style={mutedLabel}>
            List
          </Text>
          <View className="flex-row flex-wrap -mx-1">
            {lists.map((list) => {
              const selected = list.id === selectedListId;
              return (
                <Pressable
                  key={list.id}
                  onPress={() => setSelectedListId(list.id)}
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
                    className="text-xs font-sans-bold"
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

      <View className="mb-5">
        <Text className="text-xs font-sans-bold mb-2" style={mutedLabel}>
          Item
        </Text>
        <SheetTextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Cheddar cheese"
          placeholderTextColor={theme.colors["--color-muted"]}
          style={inputStyle}
        />
      </View>

      <View className="mb-5">
        <Text className="text-xs font-sans-bold mb-2" style={mutedLabel}>
          Quantity (optional)
        </Text>
        <SheetTextInput
          value={quantity}
          onChangeText={setQuantity}
          placeholder="e.g. 2 blocks"
          placeholderTextColor={theme.colors["--color-muted"]}
          style={inputStyle}
        />
      </View>

      <View className="mb-3">
        <Text className="text-xs font-sans-bold mb-2" style={mutedLabel}>
          Category (optional)
        </Text>
        <View className="flex-row flex-wrap -mx-1">
          {CATEGORIES.map((c) => {
            const selected = c === category;
            return (
              <Pressable
                key={c}
                onPress={() => setCategory(selected ? null : c)}
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
