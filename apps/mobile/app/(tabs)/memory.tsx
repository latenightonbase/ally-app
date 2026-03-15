import React, { useEffect, useState, useCallback } from "react";
import {
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { useAppStore } from "../../store/useAppStore";
import { getYouScreen, getTodayBriefing, type YouScreenData } from "../../lib/api";
import type { Briefing } from "../../lib/api";
import { YouHeader } from "../../components/you/YouHeader";
import { BriefingCard } from "../../components/you/BriefingCard";
import { YourWorldSection } from "../../components/you/YourWorldSection";
import { WhatYoureBuildingSection } from "../../components/you/WhatYoureBuildingSection";
import { ComingUpSection } from "../../components/you/ComingUpSection";
import { RecentStorySection } from "../../components/you/RecentStorySection";
import { YourPatternsSection } from "../../components/you/YourPatternsSection";
import { WhatAllyNoticesSection } from "../../components/you/WhatAllyNoticesSection";
import { CompletenessNudge } from "../../components/you/CompletenessNudge";

export default function YouScreen() {
  const user = useAppStore((s) => s.user);
  const [data, setData] = useState<YouScreenData | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [episodeIds, setEpisodeIds] = useState<Set<string>>(new Set());

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [youData, briefingData] = await Promise.all([
        getYouScreen(),
        getTodayBriefing(),
      ]);
      setData(youData);
      setBriefing(briefingData.briefing);
      setEpisodeIds(new Set(youData.recentEpisodes.map((e) => e.id)));
    } catch {
      setError("Couldn't load your profile. Pull down to try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleEpisodeDelete = useCallback((id: string) => {
    setEpisodeIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        recentEpisodes: prev.recentEpisodes.filter((e) => e.id !== id),
      };
    });
  }, []);

  const allyName = user.allyName || "Ally";

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" className="text-primary" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View className="flex-1 bg-background">
        <SafeAreaView edges={["top"]} className="flex-1">
          <View className="flex-1 px-5 pt-4">
            <Text className="text-foreground text-2xl font-sans-bold mb-2">
              You
            </Text>
            <View className="flex-1 items-center justify-center">
              <Text className="text-muted text-sm font-sans text-center">
                {error ?? "Something went wrong."}
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const completeness = data.completenessSignal;

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top"]} className="flex-1">
        <ScrollView
          className="flex-1 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
            />
          }
        >
          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300 }}
          >
            {/* Header */}
            <YouHeader
              name={data.personalInfo?.preferredName ?? user.name}
              role={null}
              location={data.personalInfo?.location ?? null}
              allyName={allyName}
            />

            {/* Today's Briefing */}
            {briefing && (
              <BriefingCard
                content={briefing.content}
                date={new Date(briefing.date).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              />
            )}

            {/* Your World — relationships */}
            {(Array.isArray(data.relationships) && data.relationships.length > 0 ||
              completeness.relationships === "fuzzy") && (
              <YourWorldSection
                relationships={Array.isArray(data.relationships) ? data.relationships : []}
                completeness={completeness.relationships}
              />
            )}

            {/* What You're Building — active goals */}
            <WhatYoureBuildingSection
              goals={Array.isArray(data.goals) ? data.goals : []}
              completeness={completeness.work}
            />

            {/* Coming Up — next 7 days events */}
            <ComingUpSection events={Array.isArray(data.upcomingEvents) ? data.upcomingEvents : []} />

            {/* Recent Story — episodic timeline */}
            <RecentStorySection
              episodes={(Array.isArray(data.recentEpisodes) ? data.recentEpisodes : []).filter((e) =>
                episodeIds.has(e.id),
              )}
              onDelete={handleEpisodeDelete}
            />

            {/* Your Patterns — emotional fingerprint */}
            <YourPatternsSection
              emotionalPatterns={data.emotionalPatterns}
              completeness={completeness.emotionalPatterns}
            />

            {/* What Ally Notices — dynamic attributes */}
            <WhatAllyNoticesSection
              dynamicAttributes={data.dynamicAttributes}
              allyName={allyName}
            />

            {/* Interests nudge if fuzzy */}
            {completeness.interests === "fuzzy" && (
              <View className="mb-4">
                <Text className="text-muted text-xs font-sans-medium uppercase tracking-wider mb-3 px-1">
                  Interests
                </Text>
                <CompletenessNudge section="interests" prompt="" />
              </View>
            )}
          </MotiView>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
