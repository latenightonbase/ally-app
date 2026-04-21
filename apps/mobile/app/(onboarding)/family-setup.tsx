import React from "react";
import { View, Text, Pressable } from "react-native";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { OnboardingShell } from "../../components/onboarding/OnboardingShell";
import { useTheme } from "../../context/ThemeContext";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

interface ChoiceCardProps {
  icon: IoniconsName;
  title: string;
  description: string;
  delay: number;
  onPress: () => void;
}

function ChoiceCard({ icon, title, description, delay, onPress }: ChoiceCardProps) {
  const { theme } = useTheme();
  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 450, delay }}
    >
      <Pressable
        onPress={onPress}
        className="flex-row items-start bg-surface rounded-2xl p-5 active:opacity-80"
        style={{
          borderWidth: 1,
          borderColor: theme.colors["--color-muted"] + "22",
        }}
      >
        <View
          className="w-12 h-12 rounded-2xl items-center justify-center mr-4"
          style={{ backgroundColor: theme.colors["--color-primary"] + "1F" }}
        >
          <Ionicons
            name={icon}
            size={24}
            color={theme.colors["--color-primary"]}
          />
        </View>
        <View className="flex-1 pt-0.5">
          <Text className="text-foreground font-sans-semibold text-base mb-1">
            {title}
          </Text>
          <Text className="text-muted text-sm font-sans leading-5">
            {description}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={theme.colors["--color-muted"]}
          style={{ marginTop: 12 }}
        />
      </Pressable>
    </MotiView>
  );
}

export default function FamilySetupScreen() {
  const handleCreate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(onboarding)/family-create");
  };

  const handleJoin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(onboarding)/family-join");
  };

  return (
    <OnboardingShell step={7} totalSteps={7} canGoBack={false}>
      <View className="mt-4">
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 450 }}
          className="self-start px-3 py-1 rounded-full bg-primary-soft mb-4"
        >
          <Text className="text-primary text-xs font-sans-semibold tracking-widest uppercase">
            One more thing
          </Text>
        </MotiView>

        <Text className="text-foreground text-3xl font-sans-bold leading-tight mb-3">
          Your family space.
        </Text>
        <Text className="text-muted text-base font-sans leading-6 mb-8">
          Anzi works best when your whole family is on the same page. Start a new
          family or hop into an existing one.
        </Text>
      </View>

      <View className="gap-3">
        <ChoiceCard
          icon="home-outline"
          title="Create a family"
          description="Pick a name, choose an artwork, and invite the people you love."
          delay={150}
          onPress={handleCreate}
        />
        <ChoiceCard
          icon="enter-outline"
          title="Join a family"
          description="Have an invite code? Use it to jump into your family right away."
          delay={260}
          onPress={handleJoin}
        />
      </View>
    </OnboardingShell>
  );
}
