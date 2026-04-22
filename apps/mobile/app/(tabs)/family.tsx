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
  Pressable,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
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
import { Avatar } from "../../components/ui/Avatar";
import { colorForId, MEMBER_COLORS } from "../../constants/memberColors";

function MemberRow({
  name,
  role,
  color,
  online,
  last,
}: {
  name: string;
  role: string;
  color: string;
  online?: boolean;
  last?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View
      className="flex-row items-center"
      style={{
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors["--color-border"],
      }}
    >
      <Avatar name={name} size="md" color={color} online={online} />
      <View className="flex-1 ml-3">
        <Text
          className="text-sm font-sans-bold"
          style={{ color: theme.colors["--color-foreground"] }}
        >
          {name}
        </Text>
        <Text
          className="text-xs font-sans capitalize mt-0.5"
          style={{ color: theme.colors["--color-muted"] }}
        >
          {role}
        </Text>
      </View>
      {online && (
        <View
          className="rounded-full px-2 py-0.5"
          style={{ backgroundColor: theme.colors["--color-primary-soft"] }}
        >
          <Text
            className="text-[10px] font-sans-bold"
            style={{
              color: theme.colors["--color-primary"],
              letterSpacing: 0.8,
            }}
          >
            ONLINE
          </Text>
        </View>
      )}
    </View>
  );
}

function InviteCodeInput({
  value,
  onChange,
  hasError,
}: {
  value: string;
  onChange: (next: string) => void;
  hasError: boolean;
}) {
  const { theme } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={(t) => onChange(t.toUpperCase().slice(0, 6))}
      placeholder="ABCDEF"
      placeholderTextColor={theme.colors["--color-faint"]}
      autoCapitalize="characters"
      autoCorrect={false}
      maxLength={6}
      style={{
        backgroundColor: theme.colors["--color-background"],
        borderWidth: 2,
        borderColor: hasError
          ? theme.colors["--color-danger"]
          : theme.colors["--color-border"],
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 16,
        color: theme.colors["--color-foreground"],
        fontSize: 22,
        fontFamily: "Nunito_700Bold",
        textAlign: "center",
        letterSpacing: 8,
      }}
    />
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
  const isAdmin =
    (useAppStore((s) => s.user) as { familyRole?: string }).familyRole ===
    "admin";
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

  const performJoin = useCallback(
    async (code: string) => {
      setJoinLoading(true);
      setJoinError(null);
      try {
        await joinFamilyByCode(code);
        setJoinCode("");
        if (hasFamily) {
          router.replace("/(tabs)");
        }
        load();
      } catch (e: unknown) {
        const msg =
          e instanceof Error
            ? e.message
            : "Could not join family. Check the code and try again.";
        setJoinError(msg);
      } finally {
        setJoinLoading(false);
      }
    },
    [hasFamily, load],
  );

  const handleJoinByCode = useCallback(() => {
    const code = joinCode.trim();
    if (code.length < 6) return;
    if (hasFamily) {
      Alert.alert(
        "Leave current family?",
        "Joining a new family will remove you from your current one. Continue?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Join",
            style: "destructive",
            onPress: () => performJoin(code),
          },
        ],
      );
      return;
    }
    performJoin(code);
  }, [joinCode, hasFamily, performJoin]);

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
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: theme.colors["--color-background"] }}
      >
        <ActivityIndicator
          size="large"
          color={theme.colors["--color-primary"]}
        />
      </View>
    );
  }

  if (error && !dashboard) {
    return (
      <View
        className="flex-1"
        style={{ backgroundColor: theme.colors["--color-background"] }}
      >
        <SafeAreaView edges={["top"]} className="flex-1">
          <ScreenHeader title="Family" />
          <View className="flex-1 px-5 pt-4 items-center justify-center">
            <Ionicons
              name="people-outline"
              size={48}
              color={theme.colors["--color-muted"]}
            />
            <Text
              className="text-sm font-sans text-center mt-3"
              style={{ color: theme.colors["--color-muted"] }}
            >
              {error}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const memberList = dashboard?.members ?? members;
  const buttonActive = joinCode.trim().length >= 6;

  const JoinAnotherCard = (
    <View
      className="rounded-3xl p-5 mt-4"
      style={{
        backgroundColor: theme.colors["--color-surface"],
        borderWidth: 1,
        borderColor: theme.colors["--color-border"],
      }}
    >
      <View className="flex-row items-center mb-3">
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: theme.colors["--color-primary-soft"],
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
          }}
        >
          <Ionicons
            name="enter-outline"
            size={16}
            color={theme.colors["--color-primary"]}
          />
        </View>
        <Text
          className="text-sm font-sans-bold"
          style={{ color: theme.colors["--color-foreground"] }}
        >
          {hasFamily ? "Join another family" : "Enter invite code"}
        </Text>
      </View>
      <Text
        className="text-xs font-sans mb-3"
        style={{ color: theme.colors["--color-muted"] }}
      >
        {hasFamily
          ? "Got invited somewhere else? Switch families with a 6-character code."
          : "Paste the invite code a family member shared with you."}
      </Text>
      <InviteCodeInput
        value={joinCode}
        onChange={(next) => {
          setJoinCode(next);
          setJoinError(null);
        }}
        hasError={!!joinError}
      />
      {joinError && (
        <Text
          className="text-xs font-sans-semibold mt-2"
          style={{ color: theme.colors["--color-danger"] }}
        >
          {joinError}
        </Text>
      )}
      <TouchableOpacity
        onPress={handleJoinByCode}
        disabled={!buttonActive || joinLoading}
        className="rounded-2xl items-center mt-3"
        style={{
          paddingVertical: 14,
          backgroundColor: buttonActive
            ? theme.colors["--color-primary"]
            : theme.colors["--color-border"],
          shadowColor: theme.colors["--color-primary"],
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: buttonActive ? 0.3 : 0,
          shadowRadius: 16,
          elevation: buttonActive ? 4 : 0,
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
  );

  if (!hasFamily) {
    return (
      <View
        className="flex-1"
        style={{ backgroundColor: theme.colors["--color-background"] }}
      >
        <SafeAreaView edges={["top"]} className="flex-1">
          <ScreenHeader
            title="Join a Family"
            subtitle="Enter the invite code to join"
          />
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ paddingBottom: 140 }}
            showsVerticalScrollIndicator={false}
          >
            <MotiView
              from={{ opacity: 0, translateY: 12 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 400 }}
            >
              {JoinAnotherCard}

              <View className="items-center mt-8">
                <Ionicons
                  name="people-outline"
                  size={48}
                  color={theme.colors["--color-faint"]}
                />
                <Text
                  className="text-sm font-sans text-center mt-3"
                  style={{ color: theme.colors["--color-muted"] }}
                >
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

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: theme.colors["--color-background"] }}
    >
      <SafeAreaView edges={["top"]} className="flex-1">
        <ScreenHeader
          title={familyName}
          subtitle={`${memberList.length} ${memberList.length === 1 ? "member" : "members"}`}
        />
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 140 }}
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
            <View className="mt-2">
              <View className="flex-row items-center mb-3 px-1">
                <Ionicons
                  name="people-outline"
                  size={16}
                  color={theme.colors["--color-primary"]}
                />
                <Text
                  className="text-base font-sans-bold ml-2"
                  style={{ color: theme.colors["--color-foreground"] }}
                >
                  Members
                </Text>
                <View
                  className="rounded-full px-2 py-0.5 ml-2"
                  style={{ backgroundColor: theme.colors["--color-primary-soft"] }}
                >
                  <Text
                    className="text-xs font-sans-bold"
                    style={{ color: theme.colors["--color-primary"] }}
                  >
                    {memberList.length}
                  </Text>
                </View>
              </View>
              <View
                className="rounded-3xl px-4"
                style={{
                  backgroundColor: theme.colors["--color-surface"],
                  borderWidth: 1,
                  borderColor: theme.colors["--color-border"],
                }}
              >
                {memberList.map((m, i) => (
                  <MemberRow
                    key={m.id}
                    name={m.name}
                    role={m.role ?? "member"}
                    color={
                      m.color ??
                      colorForId(m.id) ??
                      MEMBER_COLORS[i % MEMBER_COLORS.length]
                    }
                    online={false}
                    last={i === memberList.length - 1}
                  />
                ))}
              </View>
            </View>

            <Pressable
              onPress={handleInvite}
              className="rounded-full mt-4 flex-row items-center justify-center active:opacity-80"
              style={{
                paddingVertical: 13,
                borderWidth: 1.5,
                borderColor: theme.colors["--color-primary"],
                borderStyle: "dashed",
                backgroundColor: "transparent",
              }}
            >
              <Ionicons
                name="share-outline"
                size={16}
                color={theme.colors["--color-primary"]}
              />
              <Text
                className="text-sm font-sans-bold ml-2"
                style={{ color: theme.colors["--color-primary"] }}
              >
                Invite a family member
              </Text>
            </Pressable>

            {inviteCode && (
              <View
                className="rounded-3xl p-5 mt-4"
                style={{
                  backgroundColor: theme.colors["--color-primary-soft"],
                  borderWidth: 1,
                  borderColor: theme.colors["--color-primary-soft"],
                }}
              >
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center">
                    <Ionicons
                      name="key-outline"
                      size={16}
                      color={theme.colors["--color-primary"]}
                    />
                    <Text
                      className="text-sm font-sans-bold ml-2"
                      style={{ color: theme.colors["--color-primary"] }}
                    >
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
                        color={theme.colors["--color-primary"]}
                      />
                    </TouchableOpacity>
                  )}
                </View>
                <View
                  className="rounded-2xl py-4 items-center mb-3"
                  style={{
                    backgroundColor: theme.colors["--color-surface"],
                  }}
                >
                  <Text
                    className="font-sans-bold"
                    style={{
                      color: theme.colors["--color-foreground"],
                      fontSize: 30,
                      letterSpacing: 10,
                    }}
                    selectable
                  >
                    {inviteCode}
                  </Text>
                </View>
                <View className="flex-row" style={{ gap: 10 }}>
                  <TouchableOpacity
                    onPress={handleCopyCode}
                    className="flex-1 flex-row items-center justify-center rounded-2xl"
                    style={{
                      paddingVertical: 12,
                      backgroundColor: theme.colors["--color-surface"],
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="copy-outline"
                      size={15}
                      color={theme.colors["--color-primary"]}
                    />
                    <Text
                      className="text-sm font-sans-bold ml-1.5"
                      style={{ color: theme.colors["--color-primary"] }}
                    >
                      Copy
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleShareCode}
                    className="flex-1 flex-row items-center justify-center rounded-2xl"
                    style={{
                      paddingVertical: 12,
                      backgroundColor: theme.colors["--color-primary"],
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="share-outline" size={15} color="#fff" />
                    <Text className="text-white text-sm font-sans-bold ml-1.5">
                      Share
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text
                  className="text-xs font-sans mt-3 text-center"
                  style={{ color: theme.colors["--color-primary"] }}
                >
                  Share this code with anyone you'd like to join your family
                </Text>
              </View>
            )}

            {JoinAnotherCard}

            <View className="h-8" />
          </MotiView>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
