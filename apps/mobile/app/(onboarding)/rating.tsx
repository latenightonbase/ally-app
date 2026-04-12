import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import * as Haptics from "expo-haptics";
import * as StoreReview from "expo-store-review";
import { router } from "expo-router";
import { Button } from "../../components/ui/Button";
import { ProgressBackground } from "../../components/onboarding/ProgressBackground";

const STARS = [1, 2, 3, 4, 5];

export default function RatingScreen() {
  const [rating, setRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const handleStar = (star: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRating(star);
  };

  const handleRate = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSubmitted(true);

    // Trigger native App Store review prompt if rating is 4+
    if (rating >= 4) {
      try {
        const isAvailable = await StoreReview.isAvailableAsync();
        if (isAvailable) {
          await StoreReview.requestReview();
        }
      } catch {
        // non-fatal
      }
    }

    setTimeout(() => {
      router.push("/(onboarding)/paywall-value");
    }, 1000);
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(onboarding)/paywall-value");
  };

  return (
    <View className="flex-1 bg-background">
      <ProgressBackground progress={0.8} />

      <SafeAreaView edges={["top", "bottom"]} className="flex-1">
        <View className="flex-1 justify-center px-8">
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 600 }}
            className="items-center"
          >
            {submitted ? (
              <MotiView
                from={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", damping: 14 }}
                className="items-center"
              >
                <Text className="text-6xl mb-4">🎉</Text>
                <Text className="text-foreground text-2xl font-sans-bold text-center">
                  Thank you!
                </Text>
                <Text className="text-muted text-base font-sans text-center mt-2">
                  That means the world to us.
                </Text>
              </MotiView>
            ) : (
              <>
                <Text className="text-5xl mb-6">✨</Text>
                <Text className="text-foreground text-3xl font-sans-bold text-center mb-3">
                  How's Anzi doing so far?
                </Text>
                <Text className="text-muted text-base font-sans text-center leading-6 mb-10">
                  You've only just met her, but your feedback helps us make her
                  even better for you.
                </Text>

                {/* Star rating */}
                <View className="flex-row gap-3 mb-12">
                  {STARS.map((star) => (
                    <Pressable
                      key={star}
                      onPress={() => handleStar(star)}
                      hitSlop={8}
                    >
                      <MotiView
                        animate={{
                          scale: rating >= star ? 1.2 : 1,
                        }}
                        transition={{ type: "spring", damping: 12 }}
                      >
                        <Text
                          style={{
                            fontSize: 44,
                            opacity: rating >= star ? 1 : 0.3,
                          }}
                        >
                          ⭐
                        </Text>
                      </MotiView>
                    </Pressable>
                  ))}
                </View>

                <View className="w-full gap-3">
                  <Button
                    title={rating === 0 ? "Select a rating" : "Submit Rating"}
                    onPress={handleRate}
                    disabled={rating === 0}
                    size="lg"
                  />
                  <Pressable onPress={handleSkip} className="items-center py-2">
                    <Text className="text-muted text-base font-sans">
                      Skip for now
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </MotiView>
        </View>
      </SafeAreaView>
    </View>
  );
}
