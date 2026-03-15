# Frontend Integration Guide

This document is the definitive reference for the frontend team to connect the Expo/React Native mobile app (`apps/mobile`) to the Ally backend API (`apps/api`). It covers everything from API client setup to screen-by-screen integration, state management migration, and SSE streaming.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [API Client Setup](#api-client-setup)
4. [Authentication Flow](#authentication-flow)
5. [State Management Migration](#state-management-migration)
6. [Screen-by-Screen Integration](#screen-by-screen-integration)
7. [SSE Streaming (Chat)](#sse-streaming-chat)
8. [Rate Limiting & Error Handling](#rate-limiting--error-handling)
9. [Offline & Loading States](#offline--loading-states)
10. [Types Reference](#types-reference)
11. [Testing Checklist](#testing-checklist)

---

## Architecture Overview

```
┌──────────────────────┐      HTTPS/WSS        ┌──────────────────────┐
│   apps/mobile        │ ───────────────────▶   │   apps/api           │
│   (Expo / RN)        │   Authorization:       │   (Elysia / Bun)     │
│                      │   Bearer <session>     │                      │
│   Zustand Store      │                        │   Neon + Qdrant      │
│   + SecureStore      │  ◀─── JSON / SSE ───── │   Claude AI          │
└──────────────────────┘                        └──────────────────────┘
```

**Current state:** The mobile app uses local mock data (`constants/mockData.ts`) and Zustand persistence with AsyncStorage. All responses are fake `setTimeout` delays.

**Target state:** Every data operation goes through the API. Zustand becomes a client-side cache with optimistic updates. `expo-secure-store` stores the session token and minimal offline state.

---

## Prerequisites

### Dependencies to Install

```bash
cd apps/mobile
bun add expo-secure-store better-auth
```

- `expo-secure-store` — Secure storage for the session token (do NOT use AsyncStorage for tokens)
- `better-auth` — Auth client for sign-in/sign-up and session management
- No HTTP library needed — use the global `fetch` API (React Native ships it)
- No SSE library needed — we'll use `ReadableStream` / `EventSource` polyfill (see [SSE section](#sse-streaming-chat))

### Environment Configuration

Create `apps/mobile/lib/config.ts`:

```typescript
const ENV = {
  development: {
    API_BASE_URL: "http://localhost:3000/api/v1",
  },
  staging: {
    API_BASE_URL: "https://staging-api.ally-app.com/api/v1",
  },
  production: {
    API_BASE_URL: "https://api.ally-app.com/api/v1",
  },
};

const environment = __DEV__ ? "development" : "production";

export const config = ENV[environment];
```

> **Note for local dev on physical devices:** Replace `localhost` with your machine's local IP (e.g., `http://192.168.1.x:3000/api/v1`). Expo's `Constants.expoConfig?.hostUri` can help derive this dynamically.

---

## API Client Setup

Create a typed API client at `apps/mobile/lib/api.ts`:

```typescript
import * as SecureStore from "expo-secure-store";
import { config } from "./config";

const SESSION_KEY = "ally_session_token";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public rateLimitRemaining?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function setSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, token);
}

export async function clearSessionToken(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, headers = {}, skipAuth = false } = options;

  const url = `${config.API_BASE_URL}${path}`;

  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (!skipAuth) {
    const token = await getSessionToken();
    if (!token) {
      throw new ApiError("UNAUTHORIZED", "Not logged in", 401);
    }
    reqHeaders["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({
      error: { code: "UNKNOWN", message: "Unknown error", status: response.status },
    }));

    const err = errorBody.error ?? errorBody;
    throw new ApiError(
      err.code ?? "UNKNOWN",
      err.message ?? "Request failed",
      response.status,
      rateLimitRemaining ? Number(rateLimitRemaining) : undefined,
    );
  }

  return response.json() as Promise<T>;
}
```

### Typed API Functions

Create `apps/mobile/lib/api-functions.ts` — one function per endpoint:

```typescript
import { api } from "./api";
import type {
  MemoryProfile,
  MemoryFact,
  Briefing,
  WeeklyInsight,
  MemoryCategory,
} from "@ally/shared";

// ─── Health ───────────────────────────────────────────────

export async function checkHealth() {
  return api<{
    status: string;
    version: string;
    uptime: number;
    services: { database: string };
  }>("/health", { skipAuth: true });
}

// ─── Chat ─────────────────────────────────────────────────

export interface ChatResponse {
  response: string;
  conversationId: string;
  messageId: string;
}

export async function sendMessage(
  message: string,
  conversationId?: string,
): Promise<ChatResponse> {
  return api<ChatResponse>("/chat", {
    method: "POST",
    body: { message, conversationId, stream: false },
  });
}

// For streaming, see the SSE section below

// ─── Onboarding ───────────────────────────────────────────

export interface OnboardingQA {
  question: string;
  answer: string;
}

export async function getOnboardingFollowups(opts: {
  userName: string;
  allyName: string;
  conversation: OnboardingQA[];
  dynamicRound: number;
}): Promise<{ questions: string[]; summary: string }> {
  return api("/onboarding/followup", { method: "POST", body: opts });
}

export async function completeOnboarding(opts: {
  userName: string;
  allyName: string;
  conversation: OnboardingQA[];
  dailyPingTime: string;
  timezone: string;
}): Promise<{ greeting: string; memoryProfileCreated: boolean }> {
  return api("/onboarding/complete", { method: "POST", body: opts });
}

// ─── Briefing ─────────────────────────────────────────────

export async function getTodaysBriefing(date?: string) {
  const query = date ? `?date=${date}` : "";
  return api<{
    briefing: {
      id: string;
      date: string;
      content: string;
      delivered: boolean;
      createdAt: string;
    } | null;
  }>(`/briefing${query}`);
}

export async function getBriefingHistory(limit = 7, offset = 0) {
  return api<{
    briefings: {
      id: string;
      date: string;
      content: string;
      delivered: boolean;
      createdAt: string;
    }[];
    limit: number;
    offset: number;
  }>(`/briefing/history?limit=${limit}&offset=${offset}`);
}

// ─── Memory ───────────────────────────────────────────────

export async function getMemoryProfile() {
  return api<{ profile: MemoryProfile | null }>("/memory/profile");
}

export async function deleteMemoryProfile() {
  return api<{ deleted: boolean; message: string }>("/memory/profile", {
    method: "DELETE",
  });
}

export async function getMemoryFacts(options?: {
  category?: MemoryCategory;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (options?.category) params.set("category", options.category);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const query = params.toString() ? `?${params}` : "";
  return api<{
    facts: {
      id: string;
      category: MemoryCategory;
      content: string;
      sourceDate: string;
      confidence: number;
    }[];
    total: number;
    limit: number;
    offset: number;
  }>(`/memory/facts${query}`);
}

export async function deleteMemoryFact(factId: string) {
  return api<{ deleted: boolean; factId: string }>(`/memory/facts/${factId}`, {
    method: "DELETE",
  });
}

// ─── Conversations ────────────────────────────────────────

export async function getConversations(limit = 10, offset = 0) {
  return api<{
    conversations: {
      id: string;
      preview: string;
      messageCount: number;
      createdAt: string;
      lastMessageAt: string;
    }[];
    total: number;
    limit: number;
    offset: number;
  }>(`/conversations?limit=${limit}&offset=${offset}`);
}

export async function getConversation(
  conversationId: string,
  options?: { limit?: number; before?: string },
) {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.before) params.set("before", options.before);
  const query = params.toString() ? `?${params}` : "";
  return api<{
    conversationId: string;
    messages: {
      id: string;
      role: "user" | "ally";
      content: string;
      createdAt: string;
    }[];
    hasMore: boolean;
  }>(`/conversations/${conversationId}${query}`);
}

// ─── Insights ─────────────────────────────────────────────

export async function getWeeklyInsight() {
  return api<{
    insight: WeeklyInsight | null;
    message?: string;
  }>("/insights/weekly");
}

// ─── You Screen ───────────────────────────────────────────

export interface YouScreenBase {
  personalInfo: MemoryProfile["personalInfo"];
  relationships: MemoryProfile["relationships"];
  goals: MemoryProfile["goals"];
  upcomingEvents: { id: string; content: string; eventDate: string; context: string | null }[];
  tier: string;
}

export interface YouScreenResponse extends YouScreenBase {
  emotionalPatterns: MemoryProfile["emotionalPatterns"];
  dynamicAttributes: Record<string, { value: string; confidence: number; learnedAt: string }>;
  recentEpisodes: { id: string; content: string; emotion: string | null; category: string; date: string }[];
  completenessSignal: Record<string, "clear" | "emerging" | "fuzzy">;
}

export async function getYouScreen(): Promise<YouScreenResponse> {
  return api("/profile/you");
}
```

---

## Authentication Flow

Ally uses **better-auth** for session management. The backend owns auth entirely — there is no external JWT service. The mobile app interacts with better-auth's `/api/auth/*` endpoints to sign up, sign in, and refresh sessions.

### Session Token Lifecycle

```
1. User signs up / logs in via better-auth → backend returns a session token
2. Store token: await setSessionToken(token)
3. Every API call reads token from SecureStore via api() helper (sent as Bearer token)
4. On 401 response → Clear token, redirect to login
5. Session refresh handled by better-auth client automatically
```

### Setting Up the better-auth Client

```typescript
// apps/mobile/lib/auth-client.ts
import { createAuthClient } from "better-auth/client";
import * as SecureStore from "expo-secure-store";
import { config } from "./config";
import { setSessionToken, clearSessionToken } from "./api";

export const authClient = createAuthClient({
  baseURL: config.API_BASE_URL.replace("/api/v1", ""),
  // Store session token in expo-secure-store
  storage: {
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) => SecureStore.setItemAsync(key, value),
    removeItem: (key) => SecureStore.deleteItemAsync(key),
  },
});

export async function signIn(email: string, password: string) {
  const result = await authClient.signIn.email({ email, password });
  if (result.data?.token) {
    await setSessionToken(result.data.token);
  }
  return result;
}

export async function signUp(email: string, password: string, name: string) {
  const result = await authClient.signUp.email({ email, password, name });
  if (result.data?.token) {
    await setSessionToken(result.data.token);
  }
  return result;
}

export async function signOut() {
  await authClient.signOut();
  await clearSessionToken();
}
```

> **Tier:** The user's tier (`free_trial`, `pro`, `premium`) is stored on the user record in the database and resolved server-side. It is **not** embedded in the session token. Use `GET /api/v1/user/tier` (coming soon) or read it from the `GET /api/v1/profile/you` response field.

### Auto-Redirect on 401

Add this to your root layout or a provider:

```typescript
import { router } from "expo-router";
import { clearSessionToken } from "../lib/api";

export async function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      await clearSessionToken();
      router.replace("/(auth)/login");
      return;
    }
    if (error.status === 429) {
      // Show rate limit UI — error.rateLimitRemaining will be 0
      // error.message contains the user-friendly limit message
    }
  }
}
```

---

## State Management Migration

The current Zustand store (`store/useAppStore.ts`) manages everything locally. The migration strategy is: **Zustand becomes a client-side cache**, and the API is the source of truth.

### Current Store → New Store Architecture

Create separate stores per domain. Below is the proposed structure:

```
store/
  useAuthStore.ts        — Session token, user identity, login state
  useChatStore.ts        — Active conversation, messages, streaming state
  useYouStore.ts         — "You" screen data (profile, episodes, dynamic attributes)
  useBriefingStore.ts    — Today's briefing, history
  useOnboardingStore.ts  — Onboarding flow state (conversation, round tracking)
```

### Example: `useChatStore.ts`

```typescript
import { create } from "zustand";
import { sendMessage } from "../lib/api-functions";
import { sendMessageStreaming } from "../lib/streaming";

interface ChatMessage {
  id: string;
  role: "user" | "ally";
  content: string;
  createdAt: string;
  isStreaming?: boolean;
}

interface ChatState {
  conversationId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  streamingContent: string;
  error: string | null;

  setConversation: (id: string, messages: ChatMessage[]) => void;
  send: (text: string) => Promise<void>;
  sendWithStream: (text: string) => Promise<void>;
  clearError: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversationId: null,
  messages: [],
  isLoading: false,
  streamingContent: "",
  error: null,

  setConversation: (id, messages) => set({ conversationId: id, messages }),

  send: async (text) => {
    const optimisticId = `temp-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: optimisticId,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    set((s) => ({
      messages: [...s.messages, userMsg],
      isLoading: true,
      error: null,
    }));

    try {
      const res = await sendMessage(text, get().conversationId ?? undefined);
      const allyMsg: ChatMessage = {
        id: res.messageId,
        role: "ally",
        content: res.response,
        createdAt: new Date().toISOString(),
      };
      set((s) => ({
        conversationId: res.conversationId,
        messages: [...s.messages, allyMsg],
        isLoading: false,
      }));
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : "Failed to send",
      });
    }
  },

  sendWithStream: async (text) => {
    const optimisticId = `temp-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: optimisticId,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    set((s) => ({
      messages: [...s.messages, userMsg],
      isLoading: true,
      streamingContent: "",
      error: null,
    }));

    try {
      await sendMessageStreaming(
        text,
        get().conversationId ?? undefined,
        {
          onToken: (token) => {
            set((s) => ({ streamingContent: s.streamingContent + token }));
          },
          onDone: (data) => {
            const allyMsg: ChatMessage = {
              id: data.messageId,
              role: "ally",
              content: data.fullResponse,
              createdAt: new Date().toISOString(),
            };
            set((s) => ({
              conversationId: data.conversationId,
              messages: [...s.messages, allyMsg],
              isLoading: false,
              streamingContent: "",
            }));
          },
          onError: (message) => {
            set({ isLoading: false, streamingContent: "", error: message });
          },
        },
      );
    } catch (e) {
      set({
        isLoading: false,
        streamingContent: "",
        error: e instanceof Error ? e.message : "Streaming failed",
      });
    }
  },

  clearError: () => set({ error: null }),
}));
```

### Migration Checklist for `useAppStore.ts`

The existing `useAppStore` should be gradually replaced:

| Current Store Field | New Location | Data Source |
|---|---|---|
| `isOnboarded` | `useAuthStore` | Derived from whether user has a memory profile |
| `user` (name, job, etc.) | `useAuthStore` + `useYouStore` | Session for identity, API `/profile/you` for profile |
| `messages` | `useChatStore` | API via `/chat` and `/conversations/:id` |
| `memories` | `useYouStore` | API via `/profile/you` (replaces memory vault) |
| `completeOnboarding()` | `useOnboardingStore` | `POST /onboarding/followup` → `POST /onboarding/complete` |
| `addMessage()` | `useChatStore.send()` | `POST /chat` |
| `addMemory()` / `editMemory()` / `removeMemory()` | removed — memory is managed server-side | `DELETE /memory/facts/:id` for explicit user deletion |

---

## Screen-by-Screen Integration

### 1. Root Layout (`app/index.tsx`)

**Current:** Checks `isOnboarded` from Zustand to route to onboarding or tabs.

**Change:**
```typescript
// Check if session exists AND if memory profile exists
const hasToken = await getSessionToken();
if (!hasToken) {
  router.replace("/(auth)/login");
} else {
  // Try to fetch profile to check if onboarded
  try {
    const { profile } = await getMemoryProfile();
    if (profile) {
      router.replace("/(tabs)");
    } else {
      router.replace("/(onboarding)");
    }
  } catch {
    router.replace("/(auth)/login");
  }
}
```

### 2. Onboarding (`app/(onboarding)/index.tsx`)

**Current:** Collects user input across 8 fixed steps, saves to Zustand locally.

**Change:** Onboarding is now a **dynamic conversation**. The backend generates follow-up questions based on prior answers. There is no fixed set of questions.

**New UX flow:**

```
Step 1 (local)
  → Collect userName + allyName (simple text inputs, no API call yet)

Step 2–N (dynamic)
  → POST /onboarding/followup  with { userName, allyName, conversation, dynamicRound }
  → Backend returns next questions (or empty array to signal "done")
  → User answers each question
  → Repeat if more questions returned

Final step
  → POST /onboarding/complete with { userName, allyName, conversation, dailyPingTime, timezone }
  → Returns { greeting, memoryProfileCreated: true }
  → Show greeting → navigate to /(tabs)
```

```typescript
import { getOnboardingFollowups, completeOnboarding } from "../../lib/api-functions";

// State: userName, allyName, conversation (OnboardingQA[]), currentQuestions, dynamicRound

const startOnboarding = async () => {
  // First round: call followup with empty conversation
  const { questions } = await getOnboardingFollowups({
    userName,
    allyName,
    conversation: [],
    dynamicRound: 1,
  });
  setCurrentQuestions(questions);
  setDynamicRound(1);
};

const submitRound = async (answers: string[]) => {
  // Pair each answer with its question
  const newQAs = currentQuestions.map((q, i) => ({ question: q, answer: answers[i] }));
  const updatedConversation = [...conversation, ...newQAs];
  setConversation(updatedConversation);

  const nextRound = dynamicRound + 1;
  const { questions } = await getOnboardingFollowups({
    userName,
    allyName,
    conversation: updatedConversation,
    dynamicRound: nextRound,
  });

  if (questions.length === 0) {
    // Ready to complete — collect dailyPingTime + timezone first if not already
    await finish(updatedConversation);
  } else {
    setCurrentQuestions(questions);
    setDynamicRound(nextRound);
  }
};

const finish = async (finalConversation: OnboardingQA[]) => {
  const { greeting } = await completeOnboarding({
    userName,
    allyName,
    conversation: finalConversation,
    dailyPingTime: selectedTime, // "08:00"
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  // Show greeting in a full-screen moment before going to tabs
  router.replace({ pathname: "/(onboarding)/greeting", params: { greeting } });
};
```

> The typical onboarding takes 2 dynamic rounds (4–6 questions total). The backend decides when enough context has been gathered.

### 3. Chat Screen (`app/(tabs)/index.tsx`)

**Current:** Uses `MOCK_ALLY_RESPONSES` with `setTimeout`.

**Change:**

```typescript
import { useChatStore } from "../../store/useChatStore";

export default function ChatScreen() {
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const sendWithStream = useChatStore((s) => s.sendWithStream);
  const error = useChatStore((s) => s.error);

  const handleSend = useCallback((text: string) => {
    sendWithStream(text);
  }, [sendWithStream]);

  // Render messages from store
  // When isLoading && streamingContent, show a "streaming" bubble
  // that updates in real-time as tokens arrive
}
```

**Remove:**
- `MOCK_ALLY_RESPONSES` import and usage
- `responseIndexRef`
- `getAllyResponse` function
- `setTimeout` fake typing

**Add:**
- Streaming message bubble that shows `streamingContent` progressively
- Error banner when `error` is non-null (especially for rate limits)
- Conversation loading when entering from conversation history

### 4. Home Screen (if separate from Chat)

The home screen should display:
- Greeting (can stay local — `getGreetingByTime()`)
- Today's briefing (via `getTodaysBriefing()`)
- Recent conversations list (via `getConversations(3)`)

```typescript
useEffect(() => {
  getTodaysBriefing().then(({ briefing }) => {
    if (briefing) setBriefing(briefing);
  }).catch(() => {});

  getConversations(3).then(({ conversations }) => {
    setRecentConvs(conversations);
  }).catch(() => {});
}, []);
```

### 5. "You" Screen (`app/(tabs)/you.tsx`)

**Current:** `app/(tabs)/memory.tsx` shows grouped text memories (the old "Memory Vault"). This should be replaced with the "You" screen — a living user portrait.

**Change:** Replace the memory vault entirely. Single API call, tiered response:

```typescript
import { getYouScreen } from "../../lib/api-functions";
import type { YouScreenTrial, YouScreenPro } from "../../lib/api-functions";

export default function YouScreen() {
  const [data, setData] = useState<YouScreenResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getYouScreen()
      .then(setData)
      .finally(() => setIsLoading(false));
  }, []);
}
```

**Rendering guide:**

All tiers receive the full You screen — no sections are locked. Use `completenessSignal` to show nudges like "Tell Ally more about your interests →" for sections labelled `"fuzzy"`. Weekly insights and proactive features (Premium-only) are surfaced in settings/upsell flows, not on this screen.

> **Design spec:** See `docs/PRODUCT_VISION.md` → "The You Screen" section for the full UX breakdown.

### 6. Settings Screen (`app/(tabs)/settings.tsx`)

**Current:** `handleResetMemories` just clears local state.

**Change:**

```typescript
const handleResetMemories = () => {
  Alert.alert(
    "Clear Memories",
    "This will permanently erase all memories. This cannot be undone.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMemoryProfile();
            // Clear local memory cache too
          } catch (e) {
            Alert.alert("Error", "Failed to clear memories. Try again.");
          }
        },
      },
    ],
  );
};
```

---

## SSE Streaming (Chat)

The chat endpoint supports SSE streaming via `{ stream: true }`. This gives token-by-token responses for a typewriter effect.

Create `apps/mobile/lib/streaming.ts`:

```typescript
import * as SecureStore from "expo-secure-store";
import { config } from "./config";

const SESSION_KEY = "ally_session_token";

interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (data: {
    conversationId: string;
    messageId: string;
    fullResponse: string;
  }) => void;
  onError: (message: string) => void;
}

export async function sendMessageStreaming(
  message: string,
  conversationId: string | undefined,
  callbacks: StreamCallbacks,
): Promise<void> {
  const token = await SecureStore.getItemAsync(SESSION_KEY);
  if (!token) {
    callbacks.onError("Not authenticated");
    return;
  }

  const url = `${config.API_BASE_URL}/chat`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ message, conversationId, stream: true }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: "Failed" } }));
    callbacks.onError(err.error?.message ?? "Request failed");
    return;
  }

  if (!response.body) {
    callbacks.onError("No response body");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (!jsonStr) continue;

      try {
        const event = JSON.parse(jsonStr);

        switch (event.type) {
          case "token":
            callbacks.onToken(event.content);
            break;
          case "done":
            callbacks.onDone({
              conversationId: event.conversationId,
              messageId: event.messageId,
              fullResponse: event.fullResponse,
            });
            break;
          case "error":
            callbacks.onError(event.message);
            break;
        }
      } catch {
        // Skip malformed events
      }
    }
  }
}
```

### React Native Compatibility Note

React Native's `fetch` may not support `ReadableStream` on all platforms. If `response.body` is null:

1. **Hermes engine (RN 0.83+):** Should support streaming. Verify with a simple test.
2. **Fallback:** If streaming doesn't work, use the non-streaming endpoint (`stream: false`) and show a typing indicator while waiting. The UX is slightly worse but functionally identical.
3. **Alternative:** Use `react-native-sse` package or `expo-fetch` (if available) as polyfills.

Test with:

```typescript
const testStream = async () => {
  const res = await fetch("https://httpbin.org/stream/3");
  console.log("Has body:", !!res.body);
  console.log("Body type:", typeof res.body);
};
```

---

## Rate Limiting & Error Handling

### Rate Limit Headers

Every authenticated response includes:

```
X-RateLimit-Limit: 50          (daily message limit)
X-RateLimit-Remaining: 42      (messages remaining today)
X-RateLimit-Reset: 1709600000  (unix timestamp when limit resets)
```

### Displaying Rate Limit Info

```typescript
// After each chat message, check remaining
const remaining = response.headers.get("x-ratelimit-remaining");
if (remaining !== "unlimited" && Number(remaining) <= 5) {
  showWarning(`${remaining} messages remaining today`);
}
```

### Error Handling by Status Code

| Status | Error Code | Frontend Action |
|--------|-----------|----------------|
| 401 | `UNAUTHORIZED` | Clear token, redirect to login |
| 403 | `FORBIDDEN` | Show upgrade prompt (feature requires higher tier) |
| 429 | `RATE_LIMIT_EXCEEDED` | Show "Limit reached" banner with reset time |
| 503 | `AI_UNAVAILABLE` | Show "Ally is resting, try again in a moment" with retry button |
| 500 | `INTERNAL_ERROR` | Show generic error, log to crash reporting |

### Rate Limit UI Component Example

```typescript
function RateLimitBanner({ resetAt }: { resetAt: number }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = resetAt - now;
      if (diff <= 0) {
        setTimeLeft("Limit reset! Try again.");
        return;
      }
      const hours = Math.floor(diff / 3600);
      const mins = Math.floor((diff % 3600) / 60);
      setTimeLeft(`Resets in ${hours}h ${mins}m`);
    };
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [resetAt]);

  return (
    <View className="bg-surface border border-warning rounded-xl p-4 mx-4">
      <Text className="text-warning font-sans-semibold">
        Daily message limit reached
      </Text>
      <Text className="text-muted text-sm font-sans mt-1">
        {timeLeft}
      </Text>
      <Pressable className="mt-2">
        <Text className="text-primary font-sans-semibold">
          Upgrade for unlimited →
        </Text>
      </Pressable>
    </View>
  );
}
```

---

## Offline & Loading States

### Network Detection

```typescript
import NetInfo from "@react-native-community/netinfo";

export function useIsOnline() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? true);
    });
    return unsub;
  }, []);

  return isOnline;
}
```

### Offline Strategy

- **Chat:** Disable send button, show "You're offline" in input area
- **Memory / Briefing:** Show cached data with "Offline — showing saved data" badge
- **Onboarding:** Block submission (requires AI), show offline message

### Loading Skeletons

Every screen that fetches data should show a skeleton/shimmer while loading, not a blank screen. Key loading states:

- Chat: Show message list + typing indicator
- Memory: Show shimmer cards in each category
- Briefing: Show shimmer in briefing card
- Conversations list: Show shimmer rows

---

## Types Reference

All shared types live in `@ally/shared` and are available as a workspace dependency. Key types you'll use:

```typescript
import type {
  // User & Tiers
  Tier,                    // "free_trial" | "basic" | "premium"
  TierLimits,              // { messagesPerDay, requestsPerMinute, ... }

  // Memory
  MemoryProfile,           // Full structured profile (JSONB)
  MemoryFact,              // Individual extracted fact
  MemoryCategory,          // "personal_info" | "relationships" | "work" | ...
  DynamicAttribute,        // { value, confidence, learnedAt, sourceConversationId? }

  // Conversation
  Message,                 // { id, conversationId, role, content, createdAt }
  Conversation,            // { id, userId, preview, messageCount, ... }

  // Briefing
  Briefing,                // { id, userId, date, content, delivered }
  WeeklyInsight,           // { weekOf, summary, moodTrend, topThemes, ... }

  // Onboarding
  OnboardingQA,            // { question: string; answer: string }
} from "@ally/shared";

// Constants
import { TIER_LIMITS } from "@ally/shared";
```

---

## Testing Checklist

Before shipping the integration, verify each flow:

### Authentication
- [ ] Session token stored securely in SecureStore (not AsyncStorage)
- [ ] 401 response clears token and redirects to login
- [ ] Token included in all authenticated requests
- [ ] App handles missing/expired session gracefully
- [ ] Sign-up and sign-in via better-auth work end-to-end

### Onboarding
- [ ] Step 1: userName + allyName collected locally
- [ ] `POST /onboarding/followup` returns dynamic questions (round 1)
- [ ] User answers cycle through rounds until `questions: []` returned
- [ ] `POST /onboarding/complete` creates profile and returns greeting
- [ ] Memory profile created (verify via `GET /profile/you`)
- [ ] 503 error shows friendly retry message (AI down)
- [ ] dailyPingTime and timezone sent correctly on complete

### Chat
- [ ] Non-streaming: message sent, response received, stored in state
- [ ] Streaming: tokens appear progressively in message bubble
- [ ] New conversation created when no `conversationId`
- [ ] Existing conversation continued when `conversationId` provided
- [ ] Rate limit hit shows banner with reset time
- [ ] 503 shows "Ally unavailable" with retry

### You Screen
- [ ] `GET /profile/you` loads full screen for all tiers (no locked sections)
- [ ] `completenessSignal` renders nudges for "fuzzy" sections
- [ ] Upcoming events (next 7 days) shown correctly
- [ ] Dynamic attributes shown when present
- [ ] Recent episodes shown with emotion tags
- [ ] Fact deletion works (`DELETE /memory/facts/:id`)

### Briefing
- [ ] Today's briefing loads on home screen
- [ ] Briefing history paginated correctly
- [ ] Briefing accessible to all tiers (no 403)
- [ ] Null briefing shows "No briefing yet" state

### Conversations
- [ ] List loads with pagination
- [ ] Tapping conversation loads full message history
- [ ] Cursor-based pagination (`before` param) works for long conversations

### Settings
- [ ] "Clear Memories" calls `DELETE /memory/profile`
- [ ] Subscription card reflects user's actual tier
- [ ] Reset onboarding calls profile deletion then navigates to onboarding

### Edge Cases
- [ ] Offline: all screens show appropriate offline state
- [ ] Slow network: loading skeletons shown, no blank screens
- [ ] Multiple rapid sends: only one in-flight at a time
- [ ] App backgrounded mid-stream: stream completes or cleans up
- [ ] Large conversation (100+ messages): pagination works, no memory crash
