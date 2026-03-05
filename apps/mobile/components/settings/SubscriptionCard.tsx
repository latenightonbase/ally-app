import React from "react";
import { View, Text } from "react-native";
import { MotiView } from "moti";
import { Button } from "../ui/Button";
import { useAppStore } from "../../store/useAppStore";

interface SubscriptionCardProps {
  plan?: string;
}

export function SubscriptionCard({ plan = "Free" }: SubscriptionCardProps) {
  const allyName = useAppStore((s) => s.user.allyName) || "Ally";

  return (
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ type: "timing", duration: 300, delay: 200 }}
    >
      <View className="bg-primary-soft rounded-3xl p-6 items-center">
        <Text className="text-primary text-sm font-sans-semibold uppercase tracking-wider mb-1">
          Current Plan
        </Text>
        <Text className="text-foreground text-2xl font-sans-bold mb-1">
          {allyName} {plan}
        </Text>
        <Text className="text-muted text-sm font-sans text-center mb-4">
          Unlimited chats, daily briefings, memory vault
        </Text>
        {plan === "Free" && (
          <Button
            title="Upgrade to Pro"
            onPress={() => {}}
            variant="primary"
            size="sm"
          />
        )}
      </View>
    </MotiView>
  );
}
