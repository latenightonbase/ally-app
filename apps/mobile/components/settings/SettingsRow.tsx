import React from "react";
import { View, Text, Pressable, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

interface SettingsRowProps {
  icon: IoniconsName;
  label: string;
  value?: string;
  isToggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
  showChevron?: boolean;
  danger?: boolean;
}

export function SettingsRow({
  icon,
  label,
  value,
  isToggle = false,
  toggleValue = false,
  onToggle,
  onPress,
  showChevron = false,
  danger = false,
}: SettingsRowProps) {
  const Container = onPress ? Pressable : View;

  return (
    <Container
      onPress={onPress}
      className="flex-row items-center py-3.5 px-4 bg-surface rounded-2xl mb-2.5"
    >
      <View
        className={`w-9 h-9 rounded-xl items-center justify-center mr-3 ${
          danger ? "bg-danger/15" : "bg-primary-soft"
        }`}
      >
        <Ionicons
          name={icon}
          size={18}
          color={danger ? "#C75D5D" : "#7C9A72"}
        />
      </View>
      <Text
        className={`flex-1 text-base font-sans-medium ${
          danger ? "text-danger" : "text-foreground"
        }`}
      >
        {label}
      </Text>
      {value && (
        <Text className="text-muted text-sm font-sans mr-2">{value}</Text>
      )}
      {isToggle && (
        <Switch
          value={toggleValue}
          onValueChange={onToggle}
          trackColor={{ false: "#9C958930", true: "#7C9A7280" }}
          thumbColor={toggleValue ? "#7C9A72" : "#f4f3f4"}
        />
      )}
      {showChevron && (
        <Ionicons name="chevron-forward" size={18} color="#9C9589" />
      )}
    </Container>
  );
}
