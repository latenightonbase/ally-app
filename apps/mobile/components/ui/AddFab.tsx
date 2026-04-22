import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, Modal } from "react-native";
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
  bottomOffset?: number;
}

export function AddFab({ actions, bottomOffset = 110 }: AddFabProps) {
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

  const fabStyle = {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors["--color-primary"],
    alignItems: "center" as const,
    justifyContent: "center" as const,
    shadowColor: theme.colors["--color-primary"],
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  };

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
          style={fabStyle}
          className="active:opacity-80"
        >
          <Ionicons name="add" size={26} color="#fff" />
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
          style={fabStyle}
          className="active:opacity-80"
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name="add" size={26} color="#fff" />
          </Animated.View>
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <Pressable className="flex-1 bg-foreground/20" onPress={close}>
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              right: 20,
              bottom: bottomOffset + 72,
            }}
          >
            {actions.map((action) => (
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
                  className="mr-3 px-3.5 py-2 rounded-full"
                  style={{
                    backgroundColor: theme.colors["--color-surface"],
                    borderWidth: 1,
                    borderColor: theme.colors["--color-border"],
                    shadowColor: "#2D1F16",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.12,
                    shadowRadius: 10,
                    elevation: 3,
                  }}
                >
                  <Text
                    className="text-xs font-sans-bold"
                    style={{ color: theme.colors["--color-foreground"] }}
                  >
                    {action.label}
                  </Text>
                </View>
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    backgroundColor: theme.colors["--color-primary"],
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: theme.colors["--color-primary"],
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 12,
                    elevation: 6,
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
