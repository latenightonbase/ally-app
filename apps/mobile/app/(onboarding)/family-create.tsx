import React, { useState } from "react";
import { View, Text, Pressable, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { FAMILY_ARTWORKS, DEFAULT_FAMILY_ARTWORK_ID } from "@ally/shared";
import { OnboardingShell } from "../../components/onboarding/OnboardingShell";
import { PrimaryCTA } from "../../components/onboarding/PrimaryCTA";
import { TextInput } from "../../components/ui/TextInput";
import { useTheme } from "../../context/ThemeContext";
import { createFamily } from "../../lib/api";
import { useFamilyStore } from "../../store/useFamilyStore";

export default function FamilyCreateScreen() {
  const { theme } = useTheme();
  const setFamily = useFamilyStore((s) => s.setFamily);

  const [name, setName] = useState("");
  const [artworkId, setArtworkId] = useState<string>(DEFAULT_FAMILY_ARTWORK_ID);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = name.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { family, members } = await createFamily({
        name: name.trim(),
        timezone,
        artworkId,
      });
      setFamily(family, members);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(onboarding)/family-invite");
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Could not create family",
        e instanceof Error ? e.message : "Please try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <OnboardingShell
      step={7}
      totalSteps={7}
      keyboardAvoiding
      footer={
        <PrimaryCTA
          title={submitting ? "Creating..." : "Continue"}
          onPress={handleSubmit}
          icon="arrow-forward"
          disabled={!canSubmit}
        />
      }
    >
      <View className="mt-4">
        <Text className="text-foreground text-3xl font-sans-bold leading-tight mb-3">
          Name your family.
        </Text>
        <Text className="text-muted text-base font-sans leading-6 mb-8">
          Pick a name and some artwork to represent your family.
        </Text>
      </View>

      {/* Name */}
      <View className="mb-6">
        <TextInput
          label="Family name"
          placeholder="The Patels, Team Adventure, Our Crew..."
          value={name}
          onChangeText={setName}
          autoFocus
          maxLength={60}
        />
      </View>

      {/* Artwork picker */}
      <View className="mb-8">
        <Text className="text-muted text-sm font-sans-medium mb-3">
          Family artwork
        </Text>
        <View className="flex-row flex-wrap -mx-1">
          {FAMILY_ARTWORKS.map((art) => {
            const selected = art.id === artworkId;
            return (
              <View key={art.id} className="w-1/3 p-1">
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setArtworkId(art.id);
                  }}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected
                      ? theme.colors["--color-primary"]
                      : theme.colors["--color-muted"] + "22",
                  }}
                >
                  <View
                    className="items-center justify-center py-6"
                    style={{ backgroundColor: art.background }}
                  >
                    <Text style={{ fontSize: 36 }}>{art.emoji}</Text>
                  </View>
                  <View className="bg-surface px-2 py-2 items-center">
                    <Text
                      className={`text-xs ${
                        selected
                          ? "text-foreground font-sans-semibold"
                          : "text-muted font-sans"
                      }`}
                    >
                      {art.label}
                    </Text>
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>

      {submitting && (
        <View className="items-center mb-4">
          <ActivityIndicator color={theme.colors["--color-primary"]} />
        </View>
      )}
    </OnboardingShell>
  );
}
