import React from "react";
import { View, Text } from "react-native";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { OnboardingShell } from "../../components/onboarding/OnboardingShell";
import { PrimaryCTA } from "../../components/onboarding/PrimaryCTA";
import { useTheme } from "../../context/ThemeContext";
import { useOnboardingStore } from "@/store/useOnboardingStore";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

interface FeatureCardProps {
  icon: IoniconsName;
  title: string;
  description: string;
  delay: number;
}

function FeatureCard({ icon, title, description, delay }: FeatureCardProps) {
  const { theme } = useTheme();
  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 450, delay }}
      className="flex-row items-start p-4 mb-3"
      style={{
        backgroundColor: theme.colors["--color-surface"],
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors["--color-border"],
      }}
    >
      <View
        className="w-11 h-11 rounded-2xl items-center justify-center mr-4"
        style={{ backgroundColor: theme.colors["--color-primary"] + "1F" }}
      >
        <Ionicons
          name={icon}
          size={22}
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
    </MotiView>
  );
}

export default function OnboardingFamilyScreen() {
  const setFamilyMembers = useOnboardingStore((s) => s.setFamilyMembers);

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFamilyMembers([]);
    router.push("/(onboarding)/challenges");
  };

  return (
    <OnboardingShell
      step={2}
      totalSteps={7}
      footer={<PrimaryCTA title="Continue" onPress={handleNext} />}
    >
      <View className="mt-4">
        <Text className="text-foreground text-3xl font-sans-bold leading-tight mb-3">
          Your family,{"\n"}all in one place.
        </Text>
        <Text className="text-muted text-base font-sans leading-6 mb-8">
          Once you're set up, you can invite your partner and kids so everyone
          shares the same calendar, tasks, and lists.
        </Text>
      </View>

      <FeatureCard
        icon="link-outline"
        title="Invite via link"
        description="Share a link so they can join your family in seconds."
        delay={150}
      />
      <FeatureCard
        icon="chatbubbles-outline"
        title="Everyone chats with Anzi"
        description="Each member gets their own thread to add tasks, events, and notes."
        delay={260}
      />
      <FeatureCard
        icon="people-outline"
        title="Shared family data"
        description="Lists, calendar, and tasks stay in sync for everyone."
        delay={370}
      />

      <MotiView
        from={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: "timing", duration: 400, delay: 520 }}
        className="mt-4"
      >
        <Text className="text-muted text-xs font-sans text-center leading-5">
          You can invite family members any time from the Family tab.
        </Text>
      </MotiView>
    </OnboardingShell>
  );
}
