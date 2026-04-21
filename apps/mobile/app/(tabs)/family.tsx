import React, { useEffect, useCallback, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Share,
  Alert,
  TextInput,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../store/useAppStore";
import { useFamilyStore } from "../../store/useFamilyStore";
import {
  getFamilyDashboard,
  createInviteLink,
  getInviteCode,
  joinFamilyByCode,
  regenerateInviteCode,
} from "../../lib/api";
import { useTheme } from "../../context/ThemeContext";
import { ScreenHeader } from "../../components/ui/ScreenHeader";

function MemberChip({
  name,
  color,
}: {
  name: string;
  color?: string;
}) {
  return (
    <View
      className="rounded-full px-3 py-1.5 mr-2 mb-2"
      style={{ backgroundColor: (color ?? "#6366F1") + "20" }}
    >
      <Text
        style={{ color: color ?? "#6366F1" }}
        className="text-sm font-sans-semibold"
      >
        {name}
      </Text>
    </View>
  );
}

export default function FamilyScreen() {
  const user = useAppStore((s) => s.user);
  const {
    dashboard,
    dashboardLoading,
    setDashboard,
    setDashboardLoading,
    members,
    family,
  } = useFamilyStore();
  const { theme } = useTheme();

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const isAdmin = (useAppStore((s) => s.user) as any).familyRole === "admin";
  const hasFamily = !!family || !!dashboard;

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setDashboardLoading(true);
      }
      setError(null);

      try {
        const dashData = await getFamilyDashboard().catch(() => null);
        if (dashData) setDashboard(dashData);

        getInviteCode()
          .then(({ code }) => setInviteCode(code))
          .catch(() => {});
      } catch {
        setError("Couldn't load family data. Pull down to try again.");
      } finally {
        setDashboardLoading(false);
        setRefreshing(false);
      }
    },
    [setDashboard, setDashboardLoading],
  );

  useEffect(() => {
    load();
  }, [load]);

  const familyName =
    family?.name ?? dashboard?.family?.name ?? `${user.name}'s Family`;

  const handleInvite = useCallback(async () => {
    try {
      const { inviteLink } = await createInviteLink({
        email: "invite@placeholder.com",
        role: "member",
      });
      await Share.share({
        message: `Join our family on Anzi! ${inviteLink}`,
        title: "Join our family on Anzi",
      });
    } catch (e) {
      if (e instanceof Error && e.message !== "User did not share") {
        Alert.alert("Error", "Could not create invite link. Please try again.");
      }
    }
  }, []);

  const handleJoinByCode = useCallback(async () => {
    const code = joinCode.trim();
    if (!code) return;
    setJoinLoading(true);
    setJoinError(null);
    try {
      await joinFamilyByCode(code);
      setJoinCode("");
      load();
    } catch (e: any) {
      setJoinError(
        e?.message ?? "Could not join family. Check the code and try again.",
      );
    } finally {
      setJoinLoading(false);
    }
  }, [joinCode, load]);

  const handleRegenerateCode = useCallback(async () => {
    Alert.alert(
      "Regenerate Code",
      "The old code will stop working. Anyone with the old code won't be able to join.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          style: "destructive",
          onPress: async () => {
            try {
              const { code } = await regenerateInviteCode();
              setInviteCode(code);
            } catch {
              Alert.alert("Error", "Could not regenerate code.");
            }
          },
        },
      ],
    );
  }, []);

  const handleCopyCode = useCallback(async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    Alert.alert("Copied!", "Invite code copied to clipboard.");
  }, [inviteCode]);

  const handleShareCode = useCallback(async () => {
    if (!inviteCode) return;
    await Share.share({
      message: `Join our family on Anzi! Use code: ${inviteCode}`,
      title: "Join our family on Anzi",
    });
  }, [inviteCode]);

  if (dashboardLoading && !dashboard) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator
          size="large"
          color={theme.colors["--color-primary"]}
        />
      </View>
    );
  }

  if (error && !dashboard) {
    return (
      <View className="flex-1 bg-background">
        <SafeAreaView edges={["top"]} className="flex-1">
          <ScreenHeader title="Family" />
          <View className="flex-1 px-5 pt-4 items-center justify-center">
            <Ionicons
              name="people-outline"
              size={48}
              color={theme.colors["--color-muted"]}
            />
            <Text className="text-muted text-sm font-sans text-center mt-3">
              {error}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // --- No family: show join-by-code UI ---
  if (!hasFamily) {
    return (
      <View className="flex-1 bg-background">
        <SafeAreaView edges={["top"]} className="flex-1">
          <ScreenHeader
            title="Join a Family"
            subtitle="Enter the invite code shared by a family member to join their family."
          />
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
          >
            <MotiView
              from={{ opacity: 0, translateY: 12 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 400 }}
            >

              <View className="bg-surface rounded-2xl p-5 border border-primary-soft">
                <Text className="text-foreground text-sm font-sans-semibold mb-3">
                  Invite Code
                </Text>
                <TextInput
                  value={joinCode}
                  onChangeText={(t) => {
                    setJoinCode(t.toUpperCase());
                    setJoinError(null);
                  }}
                  placeholder="e.g. A3KX7Q"
                  placeholderTextColor={theme.colors["--color-muted"]}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={6}
                  className="bg-background border border-primary-soft rounded-xl px-4 py-3 text-foreground text-lg font-sans-bold text-center tracking-widest mb-3"
                  style={{
                    letterSpacing: 6,
                    color: theme.colors["--color-foreground"],
                  }}
                />
                {joinError && (
                  <Text
                    className="text-sm font-sans mb-3"
                    style={{
                      color: theme.colors["--color-danger"] ?? "#DC2626",
                    }}
                  >
                    {joinError}
                  </Text>
                )}
                <TouchableOpacity
                  onPress={handleJoinByCode}
                  disabled={joinCode.trim().length < 6 || joinLoading}
                  className="rounded-xl py-3.5 items-center"
                  style={{
                    backgroundColor:
                      joinCode.trim().length >= 6
                        ? theme.colors["--color-primary"]
                        : theme.colors["--color-muted"] + "40",
                  }}
                  activeOpacity={0.8}
                >
                  {joinLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white text-base font-sans-bold">
                      Join Family
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <View className="items-center mt-8">
                <Ionicons
                  name="people-outline"
                  size={48}
                  color={theme.colors["--color-muted"]}
                />
                <Text className="text-muted text-sm font-sans text-center mt-3">
                  Don't have a code? Ask a family member to share their invite
                  code with you.
                </Text>
              </View>
            </MotiView>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  const memberList = dashboard?.members ?? members;

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top"]} className="flex-1">
        <ScreenHeader
          title={familyName}
          subtitle={`${memberList.length} ${memberList.length === 1 ? "member" : "members"}`}
        />
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={theme.colors["--color-primary"]}
            />
          }
        >
          <MotiView
            from={{ opacity: 0, translateY: 12 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 400 }}
          >

            {/* Members */}
            <View className="flex-row flex-wrap mt-4">
              {memberList.map((m) => (
                <MemberChip
                  key={m.id}
                  name={m.name}
                  color={m.color ?? undefined}
                />
              ))}
              <TouchableOpacity
                onPress={handleInvite}
                className="rounded-full px-3 py-1.5 mr-2 mb-2 border border-dashed border-primary-soft flex-row items-center"
                activeOpacity={0.7}
              >
                <Ionicons
                  name="share-outline"
                  size={14}
                  color={theme.colors["--color-primary"]}
                />
                <Text className="text-primary text-sm font-sans-semibold ml-1">
                  Invite
                </Text>
              </TouchableOpacity>
            </View>

            {/* Invite Code Card */}
            {inviteCode && (
              <View className="bg-surface rounded-2xl p-4 mt-4 border border-primary-soft">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center">
                    <Ionicons
                      name="key-outline"
                      size={18}
                      color={theme.colors["--color-primary"]}
                    />
                    <Text className="text-foreground text-sm font-sans-bold ml-2">
                      Family Invite Code
                    </Text>
                  </View>
                  {isAdmin && (
                    <TouchableOpacity
                      onPress={handleRegenerateCode}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="refresh-outline"
                        size={18}
                        color={theme.colors["--color-muted"]}
                      />
                    </TouchableOpacity>
                  )}
                </View>
                <View className="bg-background rounded-xl py-3 px-4 items-center mb-3">
                  <Text
                    className="text-foreground text-2xl font-sans-bold"
                    style={{ letterSpacing: 6 }}
                    selectable
                  >
                    {inviteCode}
                  </Text>
                </View>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={handleCopyCode}
                    className="flex-1 flex-row items-center justify-center rounded-xl py-2.5 border border-primary-soft"
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="copy-outline"
                      size={16}
                      color={theme.colors["--color-primary"]}
                    />
                    <Text className="text-primary text-sm font-sans-semibold ml-1.5">
                      Copy
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleShareCode}
                    className="flex-1 flex-row items-center justify-center rounded-xl py-2.5"
                    style={{
                      backgroundColor: theme.colors["--color-primary"],
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="share-outline" size={16} color="#fff" />
                    <Text className="text-white text-sm font-sans-semibold ml-1.5">
                      Share
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text className="text-muted text-xs font-sans mt-2 text-center">
                  Share this code with anyone you'd like to join your family
                </Text>
              </View>
            )}

            <View className="h-8" />
          </MotiView>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
