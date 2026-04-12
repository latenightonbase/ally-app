import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { router, useLocalSearchParams } from "expo-router";
import {
  useStripe,
  StripeProvider,
  PaymentSheet,
  PaymentSheetError,
} from "@stripe/stripe-react-native";
import * as Haptics from "expo-haptics";
import { Button } from "../../components/ui/Button";
import { ProgressBackground } from "../../components/onboarding/ProgressBackground";
import { useTheme } from "../../context/ThemeContext";
import { useAppStore } from "../../store/useAppStore";

const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

function PaymentContent() {
  const { theme } = useTheme();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { priceId, planId, price } = useLocalSearchParams<{
    priceId: string;
    planId: string;
    price: string;
  }>();
  const setHasPaid = useAppStore((s) => s.setHasPaid);

  const [loading, setLoading] = useState(true);
  const [paymentReady, setPaymentReady] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    initializePaymentSheet();
  }, []);

  const initializePaymentSheet = async () => {
    try {
      // Create a subscription setup intent from our API
      const response = await fetch(`${API_URL}/api/billing/setup-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, planId }),
      });

      if (!response.ok) {
        throw new Error("Failed to initialize payment");
      }

      const { paymentIntent, ephemeralKey, customer, publishableKey } =
        await response.json();

      const { error } = await initPaymentSheet({
        merchantDisplayName: "Anzi",
        customerId: customer,
        customerEphemeralKeySecret: ephemeralKey,
        paymentIntentClientSecret: paymentIntent,
        allowsDelayedPaymentMethods: false,
        defaultBillingDetails: { name: "" },
        applePay: {
          merchantCountryCode: "US",
        },
        appearance: {
          colors: {
            primary: theme.preview.primary,
            background: theme.preview.background,
            componentBackground: theme.colors["--color-surface"],
            componentText: theme.colors["--color-foreground"],
            placeholderText: theme.colors["--color-muted"],
            icon: theme.colors["--color-muted"],
          },
          shapes: {
            borderRadius: 16,
          },
        },
      });

      if (error) {
        Alert.alert("Setup error", error.message);
        return;
      }

      setPaymentReady(true);
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Could not initialize payment.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    if (!paymentReady) return;
    setPaying(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const { error } = await presentPaymentSheet();

    if (error) {
      if (error.code !== PaymentSheetError.Canceled) {
        Alert.alert("Payment failed", error.message);
      }
      setPaying(false);
      return;
    }

    // Payment succeeded
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setHasPaid(true);

    // Navigate to account creation
    router.push("/(onboarding)/create-account");
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={theme.preview.primary} />
        <Text className="text-muted text-base font-sans mt-4">
          Preparing checkout...
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 justify-center px-8">
      <MotiView
        from={{ opacity: 0, translateY: 20 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 600 }}
        className="items-center"
      >
        <Text className="text-5xl mb-6">🔐</Text>
        <Text className="text-foreground text-3xl font-sans-bold text-center mb-3">
          Complete your trial
        </Text>
        <Text className="text-muted text-base font-sans text-center leading-6 mb-8">
          You won't be charged until your 7-day free trial ends. Cancel anytime
          before then.
        </Text>

        {/* Plan summary */}
        <View className="w-full bg-surface border border-primary/15 rounded-2xl p-5 mb-8">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-foreground text-base font-sans-semibold">
              {planId === "annual" ? "Annual Plan" : "Monthly Plan"}
            </Text>
            <Text className="text-primary text-base font-sans-bold">
              {price}
            </Text>
          </View>
          <View className="flex-row justify-between items-center">
            <Text className="text-muted text-sm font-sans">
              7-day free trial
            </Text>
            <View className="bg-primary/15 rounded-full px-3 py-0.5">
              <Text className="text-primary text-xs font-sans-semibold">
                Due today: $0
              </Text>
            </View>
          </View>
        </View>

        {/* Security badge */}
        <View className="flex-row items-center gap-2 mb-10">
          <Text className="text-sm">🔒</Text>
          <Text className="text-muted text-sm font-sans">
            Secured by Stripe · Apple Pay supported
          </Text>
        </View>

        <View className="w-full gap-3">
          <Button
            title={paying ? "Processing..." : "Start Free Trial →"}
            onPress={handlePay}
            disabled={!paymentReady || paying}
            size="lg"
          />
        </View>

        <Text className="text-muted text-xs font-sans text-center mt-6 leading-5">
          By continuing, you agree to our Terms & Privacy Policy. Subscription
          auto-renews unless cancelled.
        </Text>
      </MotiView>
    </View>
  );
}

export default function PaymentScreen() {
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <View className="flex-1 bg-background">
        <ProgressBackground progress={0.97} />
        <SafeAreaView edges={["top", "bottom"]} className="flex-1">
          <PaymentContent />
        </SafeAreaView>
      </View>
    </StripeProvider>
  );
}
