import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  Linking,
  AppState,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";
import { useAppStore, clearPersistedStorage } from "../../store/useAppStore";
import {
  useFamilyStore,
  clearFamilyPersistedStorage,
} from "../../store/useFamilyStore";
import { useSettingsSheet } from "../../store/useSettingsSheet";
import { authClient, useSession } from "../../lib/auth";
import {
  deleteMemoryProfile,
  getUserProfile,
  updateUserProfile,
  type UserProfileData,
} from "../../lib/api";
import { ThemePicker } from "./ThemePicker";
import { SubscriptionCard } from "./SubscriptionCard";
import { SettingsRow } from "./SettingsRow";
import { SheetTextInput } from "../modals/SheetContainer";

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

function SectionLabel({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  return (
    <Text
      className="text-xs font-sans-bold mt-6 mb-3 px-1"
      style={{
        color,
        letterSpacing: 1.4,
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
}

export function SettingsSheet() {
  const { theme, themeId, setTheme, themeVars } = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const visible = useSettingsSheet((s) => s.visible);
  const dismiss = useSettingsSheet((s) => s.dismiss);

  const user = useAppStore((s) => s.user);
  const tier = useAppStore((s) => s.tier);
  const resetStore = useAppStore((s) => s.reset);
  const setUser = useAppStore((s) => s.setUser);
  const setTier = useAppStore((s) => s.setTier);
  const { data: session } = useSession();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [serverProfile, setServerProfile] = useState<UserProfileData | null>(
    null,
  );
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  const snapPoints = useMemo(() => ["92%"], []);

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

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const profile = await getUserProfile();
        setServerProfile(profile);
        setTier(profile.tier);
      } catch {
        // Best-effort
      }
    })();
  }, [visible, setTier]);

  useEffect(() => {
    if (visible) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    setEditingName(false);
    setTimePickerOpen(false);
    dismiss();
  }, [dismiss]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={0.55}
      />
    ),
    [],
  );

  const handleToggleNotifications = useCallback(async (value: boolean) => {
    if (value) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === "granted") {
        setNotificationsEnabled(true);
      } else {
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

  const handleSaveName = useCallback(
    async (next: string) => {
      const trimmed = next.trim();
      if (!trimmed) return;
      setEditingName(false);
      const previous = serverProfile;
      setServerProfile((prev) => (prev ? { ...prev, name: trimmed } : prev));
      setUser({ name: trimmed });
      try {
        const updated = await updateUserProfile({ name: trimmed });
        setServerProfile(updated);
      } catch {
        setServerProfile(previous);
        setUser({ name: previous?.name ?? "" });
        Alert.alert("Error", "Could not save changes. Please try again.");
      }
    },
    [serverProfile, setUser],
  );

  const handleTimeChange = useCallback(
    async (time: string) => {
      setTimePickerOpen(false);
      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const updated = await updateUserProfile({
          dailyPingTime: time,
          timezone,
        });
        setServerProfile(updated);
        setUser({ dailyPingTime: time, timezone });
      } catch {
        Alert.alert(
          "Error",
          "Could not update briefing time. Please try again.",
        );
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
          dismiss();
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

  const allyNameLabel = user.allyName || "Anzi";

  const handleResetAnzi = () => {
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
            dismiss();
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
              Alert.alert(
                "Error",
                "Could not clear memories. Please try again.",
              );
            }
          },
        },
      ],
    );
  };

  const displayName =
    serverProfile?.name ?? session?.user?.name ?? user.name ?? "";
  const displayAllyName = serverProfile?.allyName ?? user.allyName ?? "Anzi";
  const displayPingTime = serverProfile?.dailyPingTime
    ? (TIME_LABELS[serverProfile.dailyPingTime] ??
      serverProfile.dailyPingTime)
    : "";

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      keyboardBehavior={Platform.OS === "ios" ? "interactive" : "interactive"}
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{
        backgroundColor: theme.colors["--color-border"],
        width: 40,
      }}
      backgroundStyle={{
        backgroundColor: theme.colors["--color-background"],
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
      }}
      onDismiss={handleDismiss}
    >
      <View style={[{ flex: 1 }, themeVars]}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{ color: theme.colors["--color-foreground"] }}
          className="text-2xl font-sans-bold flex-1"
        >
          Settings
        </Text>
        <Pressable
          onPress={dismiss}
          hitSlop={10}
          className="active:opacity-70"
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: theme.colors["--color-surface"],
            borderWidth: 1,
            borderColor: theme.colors["--color-border"],
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="close"
            size={16}
            color={theme.colors["--color-muted"]}
          />
        </Pressable>
      </View>

      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          className="text-sm font-sans mb-4"
          style={{ color: theme.colors["--color-muted"] }}
        >
          {displayName
            ? `Hi ${displayName}, manage your ${displayAllyName} experience here.`
            : `Manage your ${displayAllyName} experience here.`}
        </Text>

        <ThemePicker activeTheme={themeId} onSelectTheme={setTheme} />

        <SectionLabel color={theme.colors["--color-muted"]}>
          Notifications
        </SectionLabel>
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
          onPress={() => setTimePickerOpen((v) => !v)}
        />
        {timePickerOpen && (
          <View
            className="rounded-2xl p-4 mb-2"
            style={{
              backgroundColor: theme.colors["--color-surface"],
              borderWidth: 1,
              borderColor: theme.colors["--color-border"],
            }}
          >
            <View className="flex-row flex-wrap -mx-1">
              {TIME_OPTIONS.map((t) => {
                const active =
                  (serverProfile?.dailyPingTime ?? "09:00") === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => handleTimeChange(t)}
                    className="mx-1 mb-2 px-3.5 py-2 rounded-full active:opacity-80"
                    style={{
                      backgroundColor: active
                        ? theme.colors["--color-primary"]
                        : theme.colors["--color-primary-soft"],
                    }}
                  >
                    <Text
                      className="text-xs font-sans-bold"
                      style={{
                        color: active ? "#fff" : theme.colors["--color-primary"],
                      }}
                    >
                      {TIME_LABELS[t] ?? t}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <SectionLabel color={theme.colors["--color-muted"]}>
          Subscription
        </SectionLabel>
        <SubscriptionCard
          tier={tier ?? serverProfile?.tier}
          allyName={displayAllyName}
        />

        <SectionLabel color={theme.colors["--color-muted"]}>
          Account
        </SectionLabel>
        <SettingsRow
          icon="person-outline"
          label="Name"
          value={displayName || undefined}
          showChevron
          onPress={() => {
            setNameDraft(displayName);
            setEditingName(true);
          }}
        />
        {editingName && (
          <View
            className="rounded-2xl p-3 mb-2"
            style={{
              backgroundColor: theme.colors["--color-surface"],
              borderWidth: 1,
              borderColor: theme.colors["--color-border"],
            }}
          >
            <SheetTextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="What should we call you?"
              placeholderTextColor={theme.colors["--color-muted"]}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => handleSaveName(nameDraft)}
              style={{
                backgroundColor: theme.colors["--color-background"],
                borderWidth: 1.5,
                borderColor: theme.colors["--color-border"],
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 11,
                color: theme.colors["--color-foreground"],
                fontSize: 14,
                fontFamily: "Nunito_600SemiBold",
              }}
            />
            <View className="flex-row mt-3">
              <Pressable
                onPress={() => setEditingName(false)}
                className="flex-1 py-3 rounded-xl items-center active:opacity-80 mr-2"
                style={{
                  backgroundColor: theme.colors["--color-primary-soft"],
                }}
              >
                <Text
                  className="font-sans-bold text-sm"
                  style={{ color: theme.colors["--color-primary"] }}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleSaveName(nameDraft)}
                className="flex-1 py-3 rounded-xl items-center active:opacity-80"
                style={{ backgroundColor: theme.colors["--color-primary"] }}
              >
                <Text className="text-white font-sans-bold text-sm">
                  Save
                </Text>
              </Pressable>
            </View>
          </View>
        )}
        <SettingsRow
          icon="mail-outline"
          label="Email"
          value={serverProfile?.email ?? session?.user?.email ?? ""}
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

        <View className="items-center mt-8 mb-4">
          <Text
            className="text-xs font-sans"
            style={{ color: theme.colors["--color-muted"] }}
          >
            {displayAllyName} v1.0.0
          </Text>
          <Text
            className="text-xs font-sans mt-1"
            style={{ color: theme.colors["--color-faint"] }}
          >
            The friend who never forgets
          </Text>
        </View>
      </BottomSheetScrollView>
      </View>
    </BottomSheetModal>
  );
}
