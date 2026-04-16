import React, { useState } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  TextInput as RNTextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Button } from "../../components/ui/Button";
import { useTheme } from "../../context/ThemeContext";
import { useOnboardingStore } from "../../store/useOnboardingStore";

interface FamilyMemberInput {
  id: string;
  name: string;
  role: "parent" | "child" | "other";
  age: string;
}

export default function OnboardingFamilyScreen() {
  const { theme } = useTheme();
  const setFamilyMembers = useOnboardingStore((s) => s.setFamilyMembers);
  const [members, setMembers] = useState<FamilyMemberInput[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"parent" | "child" | "other">("child");
  const [newAge, setNewAge] = useState("");

  const addMember = () => {
    if (!newName.trim()) return;
    setMembers((prev) => [
      ...prev,
      {
        id: `m-${Date.now()}`,
        name: newName.trim(),
        role: newRole,
        age: newAge.trim(),
      },
    ]);
    setNewName("");
    setNewAge("");
    setNewRole("child");
    setShowAdd(false);
  };

  const removeMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const handleNext = () => {
    setFamilyMembers(
      members.map((m) => ({
        name: m.name,
        role: m.role,
        age: m.age ? parseInt(m.age, 10) : undefined,
      })),
    );
    router.push("/(onboarding)/challenges");
  };

  const roles: { label: string; value: "parent" | "child" | "other" }[] = [
    { label: "Partner/Spouse", value: "parent" },
    { label: "Child", value: "child" },
    { label: "Other", value: "other" },
  ];

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top", "bottom"]} className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            className="px-8 pt-12"
          >
            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 500 }}
            >
              <Text className="text-foreground text-3xl font-sans-bold mb-3">
                Tell me about your family
              </Text>
              <Text className="text-muted text-base font-sans leading-6 mb-8">
                Add the people Anzi should know about. You can always add more
                later.
              </Text>

              {members.map((member) => (
                <View
                  key={member.id}
                  className="bg-surface rounded-2xl p-4 mb-3 flex-row items-center border border-border/30"
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{
                      backgroundColor: theme.colors["--color-primary"] + "20",
                    }}
                  >
                    <Text className="text-primary font-sans-bold text-lg">
                      {member.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-foreground font-sans-semibold text-base">
                      {member.name}
                    </Text>
                    <Text className="text-muted text-sm font-sans">
                      {member.role === "parent"
                        ? "Partner"
                        : member.role === "child"
                          ? "Child"
                          : "Other"}
                      {member.age ? `, age ${member.age}` : ""}
                    </Text>
                  </View>
                  <Pressable onPress={() => removeMember(member.id)} hitSlop={8}>
                    <Ionicons
                      name="close-circle"
                      size={22}
                      color={theme.colors["--color-muted"]}
                    />
                  </Pressable>
                </View>
              ))}

              {showAdd ? (
                <View className="bg-surface rounded-2xl p-4 mb-4 border border-primary/30">
                  <RNTextInput
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="Name"
                    placeholderTextColor={theme.colors["--color-muted"]}
                    className="text-foreground text-base font-sans mb-3 bg-background rounded-xl px-4 py-3"
                    style={{ color: theme.colors["--color-foreground"] }}
                    autoFocus
                  />

                  <View className="flex-row gap-2 mb-3">
                    {roles.map((r) => (
                      <Pressable
                        key={r.value}
                        onPress={() => setNewRole(r.value)}
                        className={`flex-1 py-2.5 rounded-xl items-center ${
                          newRole === r.value ? "bg-primary" : "bg-background"
                        }`}
                      >
                        <Text
                          className={`text-sm font-sans-semibold ${
                            newRole === r.value
                              ? "text-white"
                              : "text-foreground"
                          }`}
                        >
                          {r.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {newRole === "child" && (
                    <RNTextInput
                      value={newAge}
                      onChangeText={setNewAge}
                      placeholder="Age (optional)"
                      placeholderTextColor={theme.colors["--color-muted"]}
                      keyboardType="number-pad"
                      className="text-foreground text-base font-sans mb-3 bg-background rounded-xl px-4 py-3"
                      style={{ color: theme.colors["--color-foreground"] }}
                    />
                  )}

                  <View className="flex-row gap-3">
                    <Pressable
                      onPress={() => setShowAdd(false)}
                      className="flex-1 py-3 rounded-xl bg-background items-center"
                    >
                      <Text className="text-muted font-sans-semibold">
                        Cancel
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={addMember}
                      className="flex-1 py-3 rounded-xl bg-primary items-center"
                    >
                      <Text className="text-white font-sans-semibold">Add</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => setShowAdd(true)}
                  className="bg-surface/50 rounded-2xl py-4 items-center mb-6 border border-dashed border-muted/30"
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={24}
                    color={theme.colors["--color-primary"]}
                  />
                  <Text className="text-primary font-sans-semibold mt-1">
                    Add family member
                  </Text>
                </Pressable>
              )}
            </MotiView>

            <View className="mt-auto pb-8">
              <Button title="Next" onPress={handleNext} size="lg" />
              {members.length === 0 && (
                <Pressable onPress={handleNext} className="mt-3 items-center">
                  <Text className="text-muted text-sm font-sans">
                    Skip for now
                  </Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
