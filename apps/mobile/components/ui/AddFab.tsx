import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Animated,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../context/ThemeContext";

export interface AddFabAction {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
}

interface AddFabProps {
  actions: AddFabAction[];
  /** Bottom offset in px (on top of safe area); defaults to 100 to clear the tab bar. */
  bottomOffset?: number;
}

export function AddFab({ actions, bottomOffset = 100 }: AddFabProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [open, anim]);

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setOpen((v) => !v);
  };

  const close = () => setOpen(false);

  if (actions.length === 1) {
    return (
      <View
        pointerEvents="box-none"
        style={{ position: "absolute", right: 20, bottom: bottomOffset }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actions[0].label}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            actions[0].onPress();
          }}
          className="w-14 h-14 rounded-full items-center justify-center active:opacity-80"
          style={{
            backgroundColor: theme.colors["--color-primary"],
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      </View>
    );
  }

  const rotate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{ position: "absolute", right: 20, bottom: bottomOffset }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? "Close actions" : "Add new"}
          onPress={toggle}
          className="w-14 h-14 rounded-full items-center justify-center active:opacity-80"
          style={{
            backgroundColor: theme.colors["--color-primary"],
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name="add" size={28} color="#fff" />
          </Animated.View>
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <Pressable
          className="flex-1 bg-foreground/20"
          onPress={close}
        >
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              right: 20,
              bottom: bottomOffset + 72,
            }}
          >
            {actions.map((action, idx) => (
              <Pressable
                key={action.id}
                onPress={() => {
                  Haptics.selectionAsync();
                  close();
                  action.onPress();
                }}
                className="flex-row items-center justify-end mb-3 active:opacity-80"
              >
                <View
                  className="mr-3 px-3 py-1.5 rounded-full"
                  style={{
                    backgroundColor: theme.colors["--color-surface"],
                  }}
                >
                  <Text
                    className="text-foreground text-xs font-sans-semibold"
                    style={{ color: theme.colors["--color-foreground"] }}
                  >
                    {action.label}
                  </Text>
                </View>
                <View
                  className="w-12 h-12 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: theme.colors["--color-primary"],
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.2,
                    shadowRadius: 6,
                    elevation: 5,
                  }}
                >
                  <Ionicons name={action.icon} size={20} color="#fff" />
                </View>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
