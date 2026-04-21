import React, { useState } from "react";
import { View, Text, Pressable, Alert, ActivityIndicator } from "react-native";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { OnboardingShell } from "../../components/onboarding/OnboardingShell";
import { PrimaryCTA } from "../../components/onboarding/PrimaryCTA";
import { TextInput } from "../../components/ui/TextInput";
import { useTheme } from "../../context/ThemeContext";
import { inviteFamilyByEmails } from "../../lib/api";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function FamilyInviteScreen() {
  const { theme } = useTheme();

  const [emailDraft, setEmailDraft] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const addEmail = () => {
    const trimmed = emailDraft.trim().toLowerCase();
    if (!trimmed) return;
    if (!EMAIL_REGEX.test(trimmed)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }
    if (emails.includes(trimmed)) {
      setEmailDraft("");
      return;
    }
    setEmails((prev) => [...prev, trimmed]);
    setEmailDraft("");
    Haptics.selectionAsync();
  };

  const removeEmail = (email: string) => {
    setEmails((prev) => prev.filter((e) => e !== email));
    Haptics.selectionAsync();
  };

  const finish = () => {
    router.replace("/(tabs)");
  };

  const handleSkip = () => {
    Haptics.selectionAsync();
    finish();
  };

  const handleSend = async () => {
    if (emails.length === 0) {
      finish();
      return;
    }
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await inviteFamilyByEmails(emails);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      finish();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Could not send invites",
        e instanceof Error
          ? e.message
          : "Your family is created — you can invite people later from the Family tab.",
        [{ text: "Continue", onPress: finish }],
      );
      setSubmitting(false);
    }
  };

  return (
    <OnboardingShell
      step={7}
      totalSteps={7}
      canGoBack={false}
      keyboardAvoiding
      footer={
        <View className="gap-2">
          <PrimaryCTA
            title={
              submitting
                ? "Sending..."
                : emails.length > 0
                  ? `Send ${emails.length} invite${emails.length === 1 ? "" : "s"}`
                  : "Send invites"
            }
            onPress={handleSend}
            icon="send"
            disabled={submitting || emails.length === 0}
          />
          <PrimaryCTA
            title="Skip for now"
            onPress={handleSkip}
            variant="ghost"
          />
        </View>
      }
    >
      <View className="mt-4">
        <Text className="text-foreground text-3xl font-sans-bold leading-tight mb-3">
          Invite your family.
        </Text>
        <Text className="text-muted text-base font-sans leading-6 mb-8">
          Add the people you want to share this with. They'll get an email with
          your family invite code. You can always invite more people later.
        </Text>
      </View>

      <View className="mb-6">
        <Text className="text-muted text-sm font-sans-medium mb-2">
          Email addresses
        </Text>

        <View className="flex-row items-end gap-2">
          <View className="flex-1">
            <TextInput
              placeholder="partner@example.com"
              value={emailDraft}
              onChangeText={setEmailDraft}
              onSubmitEditing={addEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              returnKeyType="done"
              autoFocus
            />
          </View>
          <Pressable
            onPress={addEmail}
            disabled={emailDraft.trim().length === 0}
            className="w-12 h-12 rounded-2xl items-center justify-center bg-primary"
            style={{ opacity: emailDraft.trim().length === 0 ? 0.4 : 1 }}
          >
            <Ionicons name="add" size={22} color="#ffffff" />
          </Pressable>
        </View>

        {emails.length > 0 && (
          <MotiView
            from={{ opacity: 0, translateY: 6 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 250 }}
            className="mt-4 gap-2"
          >
            {emails.map((email) => (
              <View
                key={email}
                className="flex-row items-center bg-surface rounded-2xl px-4 py-3"
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors["--color-muted"] + "22",
                }}
              >
                <Ionicons
                  name="mail-outline"
                  size={16}
                  color={theme.colors["--color-muted"]}
                />
                <Text className="flex-1 text-foreground font-sans text-sm ml-3">
                  {email}
                </Text>
                <Pressable
                  onPress={() => removeEmail(email)}
                  hitSlop={10}
                  className="ml-2"
                >
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={theme.colors["--color-muted"]}
                  />
                </Pressable>
              </View>
            ))}
          </MotiView>
        )}

        {emails.length === 0 && (
          <Text className="text-muted text-xs font-sans leading-5 mt-3">
            Nobody added yet — tap <Text className="font-sans-semibold">Skip for now</Text> if you'd rather do this later.
          </Text>
        )}
      </View>

      {submitting && (
        <View className="items-center mb-4">
          <ActivityIndicator color={theme.colors["--color-primary"]} />
        </View>
      )}
    </OnboardingShell>
  );
}
