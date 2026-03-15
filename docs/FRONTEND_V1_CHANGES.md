# Frontend v1 Changes

This document lists every change needed in `apps/mobile/` to make the frontend v1-ready, based on the current state of the codebase and all backend additions. It is organized by file and prioritized by impact.

---

## Summary of current state

> Last updated: March 2026 — Phase 1–6 complete.

| Area | Status | Notes |
|---|---|---|
| Auth (sign-in/sign-up) | ✅ Working | Sign-up sends empty `name` (P2, tracked below) |
| Onboarding flow | ✅ Fixed | API greeting from `/onboarding/complete` used as first message |
| Chat + streaming | ✅ Fixed | 429 rate-limit banner added; message feedback thumbs wired |
| Root routing | ✅ Fixed | Server-side onboarding check via `getMemoryProfile()`; tier loaded on mount |
| Memory / You screen | ✅ Rebuilt | Full You screen — portrait layout with all sections + completeness nudges |
| Settings | ✅ Fixed | All edit rows (Name, AllyName, Occupation, Time) wired to `PATCH /api/v1/users/profile` |
| `lib/api.ts` | ✅ Fixed | Added 6 new functions, 3 types; removed dead `submitOnboarding()` |
| Store | ✅ Fixed | `UserProfile` slimmed — server fields removed; `tier` and `setUser` added |
| Backend `/api/v1/users/profile` | ✅ New | `GET` + `PATCH` endpoints added to `routes/profile.ts` |

---

## 1. `app/index.tsx` — Fix onboarding state check

**Problem:** `isOnboarded` is read from Zustand (persisted in AsyncStorage). On a new device, reinstall, or after signing in on a different phone, this will always be `false` even though the user has been onboarded.

**Fix:** Check the server to determine onboarding state. A memory profile existing = onboarded.

```typescript
export default function Index() {
  const { data: session, isPending } = useSession();
  const [routeReady, setRouteReady] = useState(false);

  useEffect(() => {
    if (!session) return;

    getYouScreen()
      .then(() => router.replace("/(tabs)"))
      .catch((e) => {
        // 404 or empty profile = not onboarded
        router.replace("/(onboarding)");
      })
      .finally(() => setRouteReady(true));
  }, [session]);

  if (isPending || (session && !routeReady)) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return null;
}
```

**Remove** the `isOnboarded` read from this file. The local store value is now only a cache hint, not the source of truth.

---

## 2. `app/(auth)/sign-up.tsx` — Collect user name

**Problem:** `authClient.signUp.email({ name: "", email, password })` sends an empty name to better-auth. The user record in the DB has no name until onboarding completes.

**Fix:** Add a name field to the sign-up form (this is the user's real name for the auth record, separate from onboarding's "what should I call you?"):

```typescript
const [name, setName] = useState("");

// In handleSignUp:
const { error } = await authClient.signUp.email({
  name: name.trim(),
  email: email.trim(),
  password,
});
```

Add the `TextInput` for name above the email field. Label: "Your name". This populates `session.user.name` and is what's shown in Settings.

---

## 3. `app/(onboarding)/index.tsx` — Use the real greeting

**Problem:** After `completeOnboardingDynamic` succeeds, the API returns a personalized `greeting` string — but this is ignored. Instead `completeOnboarding()` in the local store generates a hardcoded template message. The onboarding goes straight to `/(tabs)` with this fake greeting already in the chat.

**Fix:** Use the API greeting as the first chat message and navigate with it:

```typescript
// In the isLastStep branch of handleNext:
const { greeting, memoryProfileCreated } = await completeOnboardingDynamic({
  userName,
  allyName,
  conversation,
  dailyPingTime,
  timezone,
});

// Store minimal local info needed for UI
completeOnboarding({
  name: userName,
  allyName,
  greeting, // pass the real greeting
  ...
});

router.replace("/(tabs)");
```

Update `useAppStore.completeOnboarding()` to accept and store the `greeting` string, then pre-populate the chat messages array with it:

```typescript
completeOnboarding: (user) => {
  const welcomeMessage: ChatMessage = {
    id: `msg-welcome-${Date.now()}`,
    text: user.greeting, // <-- use the real AI greeting
    isUser: false,
    timestamp: new Date(),
  };
  set({ isOnboarded: true, user, messages: [welcomeMessage], activeConversationId: null });
},
```

This is a one-line change to the store and a one-line change in onboarding — but the UX difference is significant.

---

## 4. `store/useAppStore.ts` — Slim down the local store

**Problem:** `UserProfile` in Zustand has `name`, `job`, `challenges`, `interests`, `briefingTime`, `dailyPingTime`, `timezone`. Most of these are never populated from the server and become stale immediately. `settings.tsx` reads `user.job` which is always `""`.

**What to keep in Zustand (genuinely local):**
- `activeConversationId` — which conversation is open in the chat UI
- `messages` — the current session's chat messages (UI cache)
- `isOnboarded` — kept as a *hint* to avoid a server round-trip on boot (but the server is still checked, see §1)
- `allyName` — set during onboarding, used throughout the UI for companion name (not worth a server trip every render)
- `userName` — the preferred name the user chose during onboarding

**What to remove from Zustand:**
- `job` — never populated, settings shows it as empty
- `challenges`, `interests` — never populated
- `briefingTime` — should come from server (user's `notificationPreferences`)

**Simplified `UserProfile`:**
```typescript
export interface UserProfile {
  name: string;        // preferred name from onboarding step 0
  allyName: string;    // chosen companion name from onboarding step 1
  dailyPingTime: string;
  timezone: string;
}
```

Update `settings.tsx` to stop reading `user.job`, `user.briefingTime`, `user.interests`. Those fields don't exist on the server-side profile in this form.

---

## 5. `app/(tabs)/memory.tsx` → "You" screen — Complete rebuild

**This is the biggest change.** The Memory Vault (grouped text facts) should be replaced with the "You" screen. The tab should be renamed from "Memory" to "You" everywhere.

### 5a. `app/(tabs)/_layout.tsx`

Change the `memory` tab:
```typescript
<Tabs.Screen
  name="memory"
  options={{
    title: "You",
    tabBarIcon: ({ color, focused }) => (
      <Ionicons
        name={focused ? "person-circle" : "person-circle-outline"}
        size={22}
        color={color}
      />
    ),
  }}
/>
```

### 5b. `app/(tabs)/memory.tsx` — New content

Replace the entire file. The new screen calls `GET /api/v1/profile/you` and renders a portrait of the user.

**Data shape returned by the endpoint (all tiers get the full response):**
```typescript
{
  personalInfo: { preferredName, fullName, location, livingSituation, ... },
  relationships: [{ name, relation, notes }],
  goals: [{ description, category, status }],
  upcomingEvents: [{ id, content, eventDate, context }],
  emotionalPatterns: { primaryStressors, copingMechanisms, moodTrends, ... },
  dynamicAttributes: { [key]: { value, confidence, learnedAt } },
  recentEpisodes: [{ id, content, emotion, category, date }],
  completenessSignal: { work: "clear"|"emerging"|"fuzzy", ... },
  tier: string,
}
```

**Screen structure (top → bottom):**

```
┌──────────────────────────────────┐
│  [Name] · [Location if known]    │  ← profile header
│  "[AI one-liner summary]"        │
└──────────────────────────────────┘

  YOUR WORLD        → relationship cards (name + relation + note)
  BUILDING          → goal cards with category tag
  COMING UP         → event cards for next 7 days
  YOUR PATTERNS     → emotional patterns (stressors, coping)
  WHAT ALLY NOTICES → dynamicAttributes (the unspoken portrait)
  RECENT MOMENTS    → recentEpisodes (story snippets with emotion tag)
```

**Completeness signal:** For each section where `completenessSignal[section] === "fuzzy"`, show a small nudge card: `"Tell ${allyName} more about your interests →"`. Tapping it opens the chat.

**Empty states:** If the profile has just been created (onboarding just finished), show warm empty states for each section rather than blank space. E.g. "As you talk to Ally, relationships will appear here."

**Add to `lib/api.ts`:**
```typescript
export interface YouScreenData {
  personalInfo: MemoryProfile["personalInfo"];
  relationships: MemoryProfile["relationships"];
  goals: Array<{ description: string; category: string; status: string }>;
  upcomingEvents: Array<{ id: string; content: string; eventDate: string; context: string | null }>;
  emotionalPatterns: MemoryProfile["emotionalPatterns"];
  dynamicAttributes: Record<string, { value: string; confidence: number; learnedAt: string }>;
  recentEpisodes: Array<{ id: string; content: string; emotion: string | null; category: string; date: string }>;
  completenessSignal: Record<string, "clear" | "emerging" | "fuzzy">;
  tier: string;
}

export async function getYouScreen(): Promise<YouScreenData> {
  return apiRequest("/api/v1/profile/you");
}
```

---

## 6. `app/(tabs)/settings.tsx` — Fix stale user data

**Problems:**
- `user.name` from Zustand store — may be stale, but `session?.user?.name` is already there (line 137). Unify to always use `session?.user?.name`
- `user.allyName` is from local store — this is fine, keep it (set during onboarding, used for labels)
- `user.job` shown in "Occupation" row — this is always `""`, remove this row
- `SubscriptionCard` has no idea what the user's actual tier is
- Briefing time shows `user.briefingTime` which is the local value, not synced with server

**Specific changes:**

**Remove the Occupation row:**
```typescript
// DELETE this:
<SettingsRow
  icon="briefcase-outline"
  label="Occupation"
  value={user.job}
  ...
/>
```

**Fix the Name row:**
```typescript
<SettingsRow
  icon="person-outline"
  label="Name"
  value={session?.user?.name ?? ""}
  // ... onPress can remain a no-op for v1 or open an edit modal
/>
```

**Fix the header greeting:**
```typescript
// Instead of: Hi {user.name}, manage your {user.allyName || "Ally"} experience
// Use:
`Hi ${session?.user?.name ?? user.name}, manage your ${user.allyName || "Ally"} experience`
```

**Fix `SubscriptionCard`:** Pass the tier into it. The tier comes from `session?.user` (better-auth exposes it on the session object since it's stored on the user record):
```typescript
// In better-auth, the user object has additional fields from the schema
// session.user.tier should be available if better-auth is configured to expose it
// If not, fetch it from GET /api/v1/profile/you (which returns tier)
<SubscriptionCard tier={(session?.user as any)?.tier ?? "free_trial"} />
```

The `SubscriptionCard` should then display the correct tier name and what's included.

---

## 7. `lib/api.ts` — Add missing functions, remove stale ones

### Add

```typescript
// GET /api/v1/profile/you
export async function getYouScreen(): Promise<YouScreenData> {
  return apiRequest("/api/v1/profile/you");
}

// GET /api/v1/briefing/history
export async function getBriefingHistory(
  limit = 7,
  offset = 0,
): Promise<{ briefings: Briefing[]; limit: number; offset: number }> {
  return apiRequest(`/api/v1/briefing/history?limit=${limit}&offset=${offset}`);
}

// GET /api/v1/insights/weekly (premium)
export async function getWeeklyInsights(
  limit = 4,
  offset = 0,
): Promise<{ insights: WeeklyInsight[]; limit: number; offset: number }> {
  return apiRequest(`/api/v1/insights/weekly?limit=${limit}&offset=${offset}`);
}
```

### Remove

```typescript
// DELETE: old single-step onboarding — this endpoint no longer exists on the backend
export async function submitOnboarding(answers: OnboardingAnswers): Promise<OnboardingResponse> { ... }
```

Keep `updateMemoryFact` and `deleteMemoryFact` — both are needed for memory hygiene on the You screen (see §10).

### Fix

The `getAuthHeaders()` function currently uses `authClient.getCookie()` and sends a `Cookie` header. This works for cookie-based sessions. Confirm this is correct with the better-auth Expo client — if the `expoClient` plugin uses bearer tokens instead, switch to:
```typescript
async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = await authClient.getSession();
  const token = session?.data?.session?.token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
```
Test this with a real device — cookie forwarding can behave differently on native vs simulator.

---

## 8. Rate limit error handling

**Currently:** 429 errors are caught and shown as generic `"Something went wrong"` or appended to chat as `"Sorry, I couldn't respond right now."`

**Fix:** Parse 429 specifically in the chat screen and show a proper banner:

```typescript
onError: (errMsg) => {
  if (errMsg.includes("daily limit") || errMsg.includes("Rate limit")) {
    // Show a rate limit banner instead of a chat message
    setRateLimitHit(true);
  } else {
    addMessage(`Sorry, I couldn't respond right now. ${errMsg}`, false);
  }
  setIsStreaming(false);
  setIsTyping(false);
},
```

The banner should say: `"You've reached today's message limit. It resets at midnight."` No upgrade prompt needed since all tiers are unlimited in v1 — but this handles the per-minute burst limit.

---

## 9. Briefing card on the You screen

The daily briefing belongs on the **You tab**, not the chat screen. It's a personalized snapshot tied to the user's profile — contextually it fits alongside emotional patterns, goals, and episodes, and it gives the tab a "fresh every morning" feel.

Place a `BriefingCard` at the very top of the You screen (above the profile sections). Fetch it in parallel with the profile data:

```typescript
// In the You screen component:
const [profile, setProfile] = useState<YouScreenData | null>(null);
const [briefing, setBriefing] = useState<string | null>(null);

useEffect(() => {
  Promise.all([
    getYouScreen().then(setProfile),
    getBriefingToday()
      .then(b => setBriefing(b?.content ?? null))
      .catch(() => {}), // briefing is best-effort
  ]).finally(() => setLoading(false));
}, []);

// Render at the top of the scroll view, before any profile section:
{briefing && (
  <BriefingCard
    content={briefing}
    onDismiss={() => setBriefing(null)}
  />
)}
```

`getBriefingToday` hits `GET /api/v1/briefings/today`. The card should feel warm (soft sunrise accent or gold tint), include a small Ally avatar icon, and be dismissible via a ✕ in the top-right corner. Dismissal is local-state only — no API call required.

---

## 10. You screen — Memory hygiene (edit + delete)

The backend fully implements both `PATCH /api/v1/memory/facts/:factId` (edit content) and `DELETE /api/v1/memory/facts/:factId`. Memory hygiene is a v1 feature — users should be able to correct or remove anything Ally has stored.

The existing `updateMemoryFact` and `deleteMemoryFact` functions in `lib/api.ts` are correct and should be kept.

In the new You screen, add a long-press or swipe action on individual memory facts (in the **recentEpisodes** list and in the raw facts accessible through a "see all" view) that surfaces edit and delete options. The `recentEpisodes` from `/profile/you` only carry `id`, `content`, `emotion`, `category` — to edit the underlying fact, use the fact's `id` with the PATCH endpoint.

A practical pattern for the You screen:
- Each episode/fact card has a swipe-left action revealing **Edit** and **Delete**
- Tapping Edit opens a bottom sheet with a `TextInput` pre-filled with the fact content
- On save, call `updateMemoryFact(id, newContent)` and update local state
- On delete, call `deleteMemoryFact(id)`, remove from local state with an optimistic update

---

## 11. Push notification token registration

`registerPushToken()` exists in `lib/api.ts` but is never called. After sign-in and after onboarding, register the Expo push token:

```typescript
import * as Notifications from "expo-notifications";

async function registerForPushNotifications() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return;
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await registerPushToken(token).catch(() => {}); // best-effort
}
```

Call this in `app/index.tsx` after the user is confirmed to be authenticated, or at the end of onboarding.

---

## Priority order for implementation

| Priority | Change | Why |
|---|---|---|
| P0 | Root routing (§1) | App is broken on new device / reinstall |
| P0 | Use real greeting (§3) | Onboarding ends with a fake message |
| P1 | You screen rebuild (§5) | This is the core product differentiator |
| P1 | Memory hygiene — edit + delete (§10) | Users must be able to correct Ally's stored facts |
| P1 | Briefing card on You tab (§9) | Surfaces daily value right on the profile tab |
| P1 | Add `getYouScreen()` to api.ts (§7) | Required for §5 and §9 |
| P1 | Settings tier fix (§6) | `SubscriptionCard` shows wrong tier |
| P2 | Sign-up name field (§2) | Session user name is empty until fixed |
| P2 | Store cleanup (§4) | Cleans up dead fields; low risk |
| P2 | Rate limit handling (§8) | UX polish |
| P3 | Push token registration (§11) | Required for proactive features (Premium, future) |

---

## Files changed summary

| File | Change type |
|---|---|
| `app/index.tsx` | Modify — server-side onboarding check |
| `app/(auth)/sign-up.tsx` | Modify — add name field |
| `app/(onboarding)/index.tsx` | Modify — use real greeting from API |
| `app/(tabs)/memory.tsx` | Rebuild — You screen |
| `app/(tabs)/_layout.tsx` | Modify — tab name + icon |
| `app/(tabs)/settings.tsx` | Modify — remove stale fields, fix tier |
| `store/useAppStore.ts` | Modify — slim down UserProfile |
| `lib/api.ts` | Modify — add getYouScreen/briefingHistory/weeklyInsights, remove submitOnboarding |
| `app/(tabs)/index.tsx` (chat) | Modify — rate limit handling |
