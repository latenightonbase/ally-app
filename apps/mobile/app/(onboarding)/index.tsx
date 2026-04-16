import React, { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { router } from "expo-router";
import { TextInput } from "../../components/ui/TextInput";
import { Button } from "../../components/ui/Button";
import { useAppStore } from "../../store/useAppStore";

export default function OnboardingNameScreen() {
  const setUser = useAppStore((s) => s.setUser);
  const existingName = useAppStore((s) => s.user.name);
  const [name, setName] = useState(existingName || "");

  const handleNext = () => {
    if (!name.trim()) return;
    setUser({ name: name.trim() });
    router.push("/(onboarding)/family");
  };

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top", "bottom"]} className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            keyboardShouldPersistTaps="handled"
            className="px-8"
          >
            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 500 }}
            >
              <View className="w-16 h-16 rounded-full bg-primary items-center justify-center mb-6">
                <Text className="text-white text-2xl font-sans-bold">A</Text>
              </View>

              <Text className="text-foreground text-3xl font-sans-bold mb-3">
                Hey there!
              </Text>
              <Text className="text-muted text-lg font-sans leading-7 mb-10">
                I'm Anzi, your family's AI organizer. Let's get to know each
                other.
              </Text>

              <TextInput
                label="What should I call you?"
                placeholder="Your first name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoFocus
                autoComplete="given-name"
              />

              <View className="mt-8">
                <Button
                  title="Next"
                  onPress={handleNext}
                  disabled={!name.trim()}
                  size="lg"
                />
              </View>
            </MotiView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
