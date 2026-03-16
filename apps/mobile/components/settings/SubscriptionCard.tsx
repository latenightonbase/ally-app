import React from "react";
import { View, Text } from "react-native";
import { MotiView } from "moti";
import { Button } from "../ui/Button";

interface SubscriptionCardProps {
  tier?: string | null;
  allyName?: string;
}

const TIER_LABELS: Record<string, string> = {
  free_trial: "Free Trial",
  basic: "Basic",
  premium: "Premium",
};

const TIER_DESCRIPTIONS: Record<string, string> = {
  free_trial: "Full access for 14 days. Upgrade anytime.",
  basic: "Unlimited chats, daily briefings, full memory.",
  premium: "All Basic features + weekly insights & proactive check-ins.",
};

export function SubscriptionCard({
  tier,
  allyName = "Anzi",
}: SubscriptionCardProps) {
  const resolvedTier = tier ?? "free_trial";
  const label = TIER_LABELS[resolvedTier] ?? resolvedTier;
  const description =
    TIER_DESCRIPTIONS[resolvedTier] ?? "Manage your subscription.";
  const isPremium = resolvedTier === "premium";

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
          {allyName} {label}
        </Text>
        <Text className="text-muted text-sm font-sans text-center mb-4">
          {description}
        </Text>
        {!isPremium && (
          <Button
            title="Upgrade to Premium"
            onPress={() => {}}
            variant="primary"
            size="sm"
          />
        )}
      </View>
    </MotiView>
  );
}
