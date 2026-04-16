import React, { useState, useEffect, useCallback } from "react";
import {
  ScrollView,
  View,
  Text,
  Alert,
  Modal,
  TextInput as RNTextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Linking,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "../../context/ThemeContext";
import { useAppStore, clearPersistedStorage } from "../../store/useAppStore";
import { useFamilyStore, clearFamilyPersistedStorage } from "../../store/useFamilyStore";
import { ThemePicker } from "../../components/settings/ThemePicker";
import { SubscriptionCard } from "../../components/settings/SubscriptionCard";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { authClient, useSession } from "../../lib/auth";
import {
  deleteMemoryProfile,
  getUserProfile,
  updateUserProfile,
  type UserProfileData,
} from "../../lib/api";
import * as Notifications from "expo-notifications";

// --- Simple edit modal ---

interface EditModalProps {
  visible: boolean;
  title: string;
  value: string;
  placeholder?: string;
  onSave: (value: string) => void;
  onClose: () => void;
}

function EditModal({
  visible,
  title,
  value,
  placeholder,
  onSave,
  onClose,
}: EditModalProps) {
  const [draft, setDraft] = useState(value);
  const { theme } = useTheme();

  useEffect(() => {
    setDraft(value);
  }, [value, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <Pressable
          className="flex-1 bg-black/40 justify-end"
          onPress={onClose}
        >
          <Pressable onPress={() => {}}>
            <View
              className="bg-surface rounded-t-3xl px-5 pt-5 pb-8"
              style={{
                backgroundColor: theme.colors["--color-surface"],
              }}
            >
              <Text className="text-foreground text-lg font-sans-semibold mb-4">
                {title}
              </Text>
              <View className="bg-background rounded-2xl px-4 py-3 mb-4 border border-primary-soft">
                <RNTextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={placeholder ?? ""}
                  placeholderTextColor={theme.colors["--color-muted"]}
                  className="text-foreground text-base font-sans"
                  style={{ color: theme.colors["--color-foreground"] }}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => draft.trim() && onSave(draft.trim())}
                />
              </View>
              <View className="flex-row gap-3">
                <Pressable
                  onPress={onClose}
                  className="flex-1 py-3.5 rounded-2xl bg-primary-soft items-center active:opacity-70"
                >
                  <Text className="text-primary font-sans-semibold">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => draft.trim() && onSave(draft.trim())}
                  className="flex-1 py-3.5 rounded-2xl bg-primary items-center active:opacity-70"
                >
                  <Text className="text-background font-sans-semibold">Save</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// --- Briefing time picker modal ---

const TIME_OPTIONS = [
  "06:00",
  "09:00",
  "12:00",
  "15:00",
  "18:00",
  "21:00",
] as const;

const TIME_LABELS: Record<string, string> = {
  "06:00": "6 AM",
  "09:00": "9 AM",
  "12:00": "12 PM",
  "15:00": "3 PM",
  "18:00": "6 PM",
  "21:00": "9 PM",
};

interface TimePickerModalProps {
  visible: boolean;
  selected: string | null;
  onSave: (time: string) => void;
  onClose: () => void;
}

function TimePickerModal({
  visible,
  selected,
  onSave,
  onClose,
}: TimePickerModalProps) {
  const [draft, setDraft] = useState(selected ?? "09:00");
  const { theme } = useTheme();

  useEffect(() => {
    if (visible) setDraft(selected ?? "09:00");
  }, [visible, selected]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 bg-black/40 justify-end"
        onPress={onClose}
      >
        <Pressable onPress={() => {}}>
          <View
            className="bg-surface rounded-t-3xl px-5 pt-5 pb-8"
            style={{ backgroundColor: theme.colors["--color-surface"] }}
          >
            <Text className="text-foreground text-lg font-sans-semibold mb-4">
              Daily Briefing Time
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-5">
              {TIME_OPTIONS.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setDraft(t)}
                  className={`px-5 py-3 rounded-2xl active:opacity-70 ${
                    draft === t ? "bg-primary" : "bg-primary-soft"
                  }`}
                >
                  <Text
                    className={`text-sm font-sans-semibold ${
                      draft === t ? "text-background" : "text-primary"
                    }`}
                  >
                    {TIME_LABELS[t] ?? t}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View className="flex-row gap-3">
              <Pressable
                onPress={onClose}
                className="flex-1 py-3.5 rounded-2xl bg-primary-soft items-center active:opacity-70"
              >
                <Text className="text-primary font-sans-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => onSave(draft)}
                className="flex-1 py-3.5 rounded-2xl bg-primary items-center active:opacity-70"
              >
                <Text className="text-background font-sans-semibold">Save</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// --- Main Settings screen ---

export default function SettingsScreen() {
  const { themeId, setTheme } = useTheme();
  const user = useAppStore((s) => s.user);
  const tier = useAppStore((s) => s.tier);
  const resetStore = useAppStore((s) => s.reset);
  const setUser = useAppStore((s) => s.setUser);
  const setTier = useAppStore((s) => s.setTier);
  const { data: session } = useSession();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Check real notification permission status on mount and when app returns from settings
  const checkNotificationPermission = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setNotificationsEnabled(status === "granted");
  }, []);

  useEffect(() => {
    checkNotificationPermission();
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        checkNotificationPermission();
      }
    });
    return () => subscription.remove();
  }, [checkNotificationPermission]);

  const handleToggleNotifications = useCallback(async (value: boolean) => {
    if (value) {
      // Try to request permission
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === "granted") {
        setNotificationsEnabled(true);
      } else {
        // Permission denied — send user to system settings
        Alert.alert(
          "Notifications Disabled",
          "To enable notifications, open your device Settings and allow notifications for Ally.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ],
        );
      }
    } else {
      // Can't programmatically revoke — send user to system settings
      Alert.alert(
        "Disable Notifications",
        "To turn off notifications, open your device Settings.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ],
      );
    }
  }, []);

  const [serverProfile, setServerProfile] = useState<UserProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Edit modal state
  const [editField, setEditField] = useState<
    "name" | "allyName" | "occupation" | null
  >(null);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const profile = await getUserProfile();
        setServerProfile(profile);
        setTier(profile.tier);
      } catch {
        // Best-effort
      } finally {
        setProfileLoading(false);
      }
    })();
  }, []);

  const handleEdit = useCallback(
    async (field: "name" | "allyName" | "occupation", value: string) => {
      setEditField(null);
      // Optimistic update — show change immediately
      const previous = serverProfile;
      setServerProfile((prev) => (prev ? { ...prev, [field]: value } : prev));
      if (field === "name" || field === "allyName") {
        setUser({ [field]: value });
      }
      setSaving(true);
      try {
        const updated = await updateUserProfile({ [field]: value });
        setServerProfile(updated);
      } catch {
        setServerProfile(previous); // revert optimistic update
        if (field === "name" || field === "allyName") {
          setUser({ [field]: previous?.[field] ?? "" });
        }
        Alert.alert("Error", "Could not save changes. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [serverProfile, setUser],
  );

  const handleTimeChange = useCallback(
    async (time: string) => {
      setTimePickerVisible(false);
      setSaving(true);
      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const updated = await updateUserProfile({ dailyPingTime: time, timezone });
        setServerProfile(updated);
        setUser({ dailyPingTime: time, timezone });
      } catch {
        Alert.alert("Error", "Could not update briefing time. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [setUser],
  );

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        onPress: async () => {
          await authClient.signOut();
          resetStore();
          useFamilyStore.getState().reset();
          await Promise.all([
            clearPersistedStorage(),
            clearFamilyPersistedStorage(),
          ]);
          router.replace("/");
        },
      },
    ]);
  };

  const handleResetAnzi = () => {
    const allyNameLabel = user.allyName || "Anzi";
    Alert.alert(
      `Reset ${allyNameLabel}`,
      "This will erase all memories and take you back to the beginning. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMemoryProfile();
            } catch {
              // Profile deletion failure shouldn't block local reset
            }
            await authClient.signOut();
            resetStore();
            await clearPersistedStorage();
            router.replace("/");
          },
        },
      ],
    );
  };

  const handleResetMemories = () => {
    const allyNameLabel = user.allyName || "Anzi";
    Alert.alert(
      "Clear Memories",
      `This will erase all of ${allyNameLabel}'s memories about you. Your chat history will remain. Are you sure?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMemoryProfile();
            } catch {
              Alert.alert("Error", "Could not clear memories. Please try again.");
            }
          },
        },
      ],
    );
  };

  const displayName =
    serverProfile?.name ?? session?.user?.name ?? user.name ?? "";
  const displayAllyName = serverProfile?.allyName ?? user.allyName ?? "Anzi";
  const displayOccupation = serverProfile?.occupation ?? "";
  const displayPingTime =
    serverProfile?.dailyPingTime
      ? TIME_LABELS[serverProfile.dailyPingTime] ?? serverProfile.dailyPingTime
      : "";

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top"]} className="flex-1">
        <ScrollView
          className="flex-1 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: 300 }}
            className="mb-6"
          >
            <Text className="text-foreground text-2xl font-sans-bold mb-1">
              Settings
            </Text>
            <Text className="text-muted text-sm font-sans">
              {displayName
                ? `Hi ${displayName}, manage your ${displayAllyName} experience here.`
                : `Manage your ${displayAllyName} experience here.`}
            </Text>
          </MotiView>

          {/* Theme Picker */}
          <ThemePicker activeTheme={themeId} onSelectTheme={setTheme} />

          {/* Notifications Section */}
          <Text className="text-foreground text-base font-sans-semibold mb-3 px-1">
            Notifications
          </Text>
          <SettingsRow
            icon="notifications-outline"
            label="Morning Briefing"
            isToggle
            toggleValue={notificationsEnabled}
            onToggle={handleToggleNotifications}
          />
          <SettingsRow
            icon="time-outline"
            label="Briefing Time"
            value={displayPingTime || undefined}
            showChevron
            onPress={() => setTimePickerVisible(true)}
          />

          {/* Subscription */}
          <Text className="text-foreground text-base font-sans-semibold mb-3 mt-6 px-1">
            Subscription
          </Text>
          <SubscriptionCard
            tier={tier ?? serverProfile?.tier}
            allyName={displayAllyName}
          />

          {/* Account Section */}
          <Text className="text-foreground text-base font-sans-semibold mb-3 mt-6 px-1">
            Account
          </Text>
          <SettingsRow
            icon="person-outline"
            label="Name"
            value={displayName || undefined}
            showChevron
            onPress={() => setEditField("name")}
          />
          <SettingsRow
            icon="mail-outline"
            label="Email"
            value={serverProfile?.email ?? session?.user?.email ?? ""}
          />
          <SettingsRow
            icon="sparkles-outline"
            label="Anzi's Name"
            value={displayAllyName}
            showChevron
            onPress={() => setEditField("allyName")}
          />
          <SettingsRow
            icon="briefcase-outline"
            label="Occupation"
            value={displayOccupation || undefined}
            showChevron
            onPress={() => setEditField("occupation")}
          />
          <SettingsRow
            icon="trash-outline"
            label="Clear All Memories"
            onPress={handleResetMemories}
            danger
          />
          <SettingsRow
            icon="refresh-outline"
            label={`Reset ${displayAllyName}`}
            onPress={handleResetAnzi}
            danger
          />
          <SettingsRow
            icon="log-out-outline"
            label="Sign Out"
            onPress={handleSignOut}
            danger
          />

          {/* App Info */}
          <View className="items-center mt-8 mb-4">
            <Text className="text-muted text-xs font-sans">
              {displayAllyName} v1.0.0
            </Text>
            <Text className="text-muted/50 text-xs font-sans mt-1">
              The friend who never forgets
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Edit modals */}
      <EditModal
        visible={editField === "name"}
        title="Your Name"
        value={displayName}
        placeholder="What should Anzi call you?"
        onSave={(v) => handleEdit("name", v)}
        onClose={() => setEditField(null)}
      />
      <EditModal
        visible={editField === "allyName"}
        title="Anzi's Name"
        value={displayAllyName}
        placeholder="e.g. Anzi, Atlas, Nova…"
        onSave={(v) => handleEdit("allyName", v)}
        onClose={() => setEditField(null)}
      />
      <EditModal
        visible={editField === "occupation"}
        title="Occupation"
        value={displayOccupation}
        placeholder="What do you do?"
        onSave={(v) => handleEdit("occupation", v)}
        onClose={() => setEditField(null)}
      />
      <TimePickerModal
        visible={timePickerVisible}
        selected={serverProfile?.dailyPingTime ?? null}
        onSave={handleTimeChange}
        onClose={() => setTimePickerVisible(false)}
      />
    </View>
  );
}
