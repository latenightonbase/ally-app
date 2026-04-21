import React from "react";
import {
  Modal,
  Pressable,
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";

interface SheetContainerProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function SheetContainer({
  visible,
  title,
  onClose,
  children,
  footer,
}: SheetContainerProps) {
  const { theme } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 bg-foreground/40 justify-end"
        onPress={onClose}
      >
        <Pressable onPress={() => {}}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View
              className="rounded-t-3xl px-5 pt-4 pb-8"
              style={{ backgroundColor: theme.colors["--color-background"] }}
            >
              <View className="items-center mb-3">
                <View className="w-10 h-1 rounded-full bg-muted/40" />
              </View>
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-foreground text-xl font-sans-bold flex-1">
                  {title}
                </Text>
                <Pressable
                  onPress={onClose}
                  hitSlop={8}
                  className="active:opacity-70 p-1"
                >
                  <Ionicons
                    name="close"
                    size={22}
                    color={theme.colors["--color-muted"]}
                  />
                </Pressable>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: 520 }}
              >
                {children}
              </ScrollView>

              {footer ? <View className="mt-4">{footer}</View> : null}
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
