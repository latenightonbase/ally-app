import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Button } from "../../components/ui/Button";
import { ProgressBackground } from "../../components/onboarding/ProgressBackground";

type PlanId = "monthly" | "annual";

interface Plan {
  id: PlanId;
  label: string;
  price: string;
  period: string;
  perMonth: string;
  badge?: string;
  priceId: string; // Stripe Price ID
}

const PLANS: Plan[] = [
  {
    id: "annual",
    label: "Annual",
    price: "$59.99",
    period: "per year",
    perMonth: "$5/mo",
    badge: "Best Value · Save 58%",
    priceId: process.env.EXPO_PUBLIC_STRIPE_ANNUAL_PRICE_ID ?? "price_annual",
  },
  {
    id: "monthly",
    label: "Monthly",
    price: "$11.99",
    period: "per month",
    perMonth: "$11.99/mo",
    priceId:
      process.env.EXPO_PUBLIC_STRIPE_MONTHLY_PRICE_ID ?? "price_monthly",
  },
];

export default function PaywallPricingScreen() {
  const [selected, setSelected] = useState<PlanId>("annual");

  const handleSelect = (id: PlanId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(id);
  };

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const plan = PLANS.find((p) => p.id === selected)!;
    router.push({
      pathname: "/(onboarding)/payment",
      params: { priceId: plan.priceId, planId: plan.id, price: plan.price },
    });
  };

  return (
    <View className="flex-1 bg-background">
      <ProgressBackground progress={0.93} />

      <SafeAreaView edges={["top", "bottom"]} className="flex-1">
        <View className="flex-1 justify-center px-8">
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 600 }}
          >
            <Text className="text-foreground text-3xl font-sans-bold text-center mb-2">
              Choose your plan
            </Text>
            <Text className="text-muted text-base font-sans text-center mb-10">
              Start with 7 days free. No charge today.
            </Text>

            {/* Plan cards */}
            <View className="gap-4 mb-10">
              {PLANS.map((plan, i) => {
                const isSelected = selected === plan.id;
                return (
                  <MotiView
                    key={plan.id}
                    from={{ opacity: 0, translateY: 12 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={{
                      type: "timing",
                      duration: 400,
                      delay: i * 100,
                    }}
                  >
                    <Pressable onPress={() => handleSelect(plan.id)}>
                      <MotiView
                        animate={{
                          borderColor: isSelected
                            ? "#6C63FF"
                            : "rgba(100,100,100,0.2)",
                          backgroundColor: isSelected
                            ? "rgba(108,99,255,0.06)"
                            : "rgba(255,255,255,0.03)",
                        }}
                        transition={{ type: "timing", duration: 200 }}
                        style={{
                          borderWidth: isSelected ? 2 : 1,
                          borderRadius: 20,
                          padding: 20,
                        }}
                      >
                        {plan.badge && (
                          <View className="absolute -top-3 left-5 bg-primary rounded-full px-3 py-0.5">
                            <Text className="text-white text-xs font-sans-semibold">
                              {plan.badge}
                            </Text>
                          </View>
                        )}
                        <View className="flex-row items-center justify-between">
                          <View>
                            <Text className="text-foreground text-lg font-sans-bold mb-0.5">
                              {plan.label}
                            </Text>
                            <Text className="text-muted text-sm font-sans">
                              {plan.perMonth}
                            </Text>
                          </View>
                          <View className="items-end">
                            <Text className="text-foreground text-2xl font-sans-bold">
                              {plan.price}
                            </Text>
                            <Text className="text-muted text-sm font-sans">
                              {plan.period}
                            </Text>
                          </View>
                        </View>

                        {/* Selected indicator */}
                        <View
                          className={`absolute right-5 top-5 w-5 h-5 rounded-full border-2 items-center justify-center ${
                            isSelected
                              ? "bg-primary border-primary"
                              : "border-muted/40 bg-transparent"
                          }`}
                        >
                          {isSelected && (
                            <Text className="text-white text-xs">✓</Text>
                          )}
                        </View>
                      </MotiView>
                    </Pressable>
                  </MotiView>
                );
              })}
            </View>

            <Button
              title="Start Free Trial →"
              onPress={handleContinue}
              size="lg"
            />

            <Text className="text-muted text-xs font-sans text-center mt-4 leading-5">
              7-day free trial, then{" "}
              {PLANS.find((p) => p.id === selected)?.price}{" "}
              {PLANS.find((p) => p.id === selected)?.period}. Cancel anytime.
            </Text>
          </MotiView>
        </View>
      </SafeAreaView>
    </View>
  );
}
