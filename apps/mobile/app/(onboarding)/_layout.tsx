import React from "react";
import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "transparent" },
      }}
    >
      <Stack.Screen name="welcome" options={{ animation: "fade" }} />
      <Stack.Screen name="questions" />
      <Stack.Screen name="magic-moment" />
      <Stack.Screen name="rating" />
      <Stack.Screen name="paywall-value" />
      <Stack.Screen name="paywall-trial" />
      <Stack.Screen name="paywall-pricing" />
      <Stack.Screen name="payment" />
      <Stack.Screen name="create-account" />
    </Stack>
  );
}
