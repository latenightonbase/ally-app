import type {
  ChatResponse,
  OnboardingAnswers,
  OnboardingResponse,
  OnboardingQA,
  DynamicOnboardingQuestion,
  OnboardingFollowupResponse,
  MemoryProfile,
  MemoryFact,
  Briefing,
  WeeklyInsight,
  Conversation,
  Message,
} from "@ally/shared";
import { authClient } from "./auth";

export type {
  ChatResponse,
  OnboardingAnswers,
  OnboardingResponse,
  OnboardingQA,
  DynamicOnboardingQuestion,
  OnboardingFollowupResponse,
  MemoryProfile,
  MemoryFact,
  Briefing,
  WeeklyInsight,
  Conversation,
  Message,
};

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const cookies = authClient.getCookie();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cookies) {
    headers["Cookie"] = cookies;
  }
  return headers;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string>),
    },
    credentials: "omit",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      body?.error?.message ?? body?.message ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status, res.headers);
  }

  return res.json();
}

export class ApiError extends Error {
  public readonly rateLimitReset?: string;

  constructor(
    message: string,
    public status: number,
    headers?: Headers,
  ) {
    super(message);
    this.name = "ApiError";
    this.rateLimitReset = headers?.get("X-RateLimit-Reset") ?? undefined;
  }
}

// --- Chat ---

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (data: {
    conversationId: string;
    messageId: string;
    fullResponse: string;
  }) => void;
  onError: (message: string, status?: number) => void;
}

export async function sendMessage(
  message: string,
  conversationId?: string,
): Promise<ChatResponse> {
  return apiRequest<ChatResponse>("/api/v1/chat", {
    method: "POST",
    body: JSON.stringify({ message, conversationId }),
  });
}

export async function sendMessageStreaming(
  message: string,
  callbacks: StreamCallbacks,
  conversationId?: string,
): Promise<void> {
  const headers = await getAuthHeaders();

  return new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/api/v1/chat`);

    Object.entries(headers).forEach(([key, val]) =>
      xhr.setRequestHeader(key, val),
    );

    let buffer = "";
    let lastIndex = 0;

    function processBuffer() {
      const newText = xhr.responseText.slice(lastIndex);
      lastIndex = xhr.responseText.length;

      buffer += newText;
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        if (!part.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(part.slice(6));
          if (data.type === "token") {
            callbacks.onToken(data.content);
          } else if (data.type === "done") {
            callbacks.onDone({
              conversationId: data.conversationId,
              messageId: data.messageId,
              fullResponse: data.fullResponse,
            });
          } else if (data.type === "error") {
            callbacks.onError(data.message);
          }
        } catch {}
      }
    }

    xhr.onprogress = () => {
      processBuffer();
    };

    xhr.onload = () => {
      processBuffer();
      if (xhr.status < 200 || xhr.status >= 300) {
        try {
          const body = JSON.parse(xhr.responseText);
          callbacks.onError(
            body?.error?.message ?? `Chat request failed (${xhr.status})`,
            xhr.status,
          );
        } catch {
          callbacks.onError(`Chat request failed (${xhr.status})`, xhr.status);
        }
      }
      resolve();
    };

    xhr.onerror = () => {
      callbacks.onError("Network error — could not reach the server");
      resolve();
    };

    xhr.ontimeout = () => {
      callbacks.onError("Request timed out");
      resolve();
    };

    xhr.timeout = 120_000;

    xhr.send(JSON.stringify({ message, conversationId, stream: true }));
  });
}

export async function sendMessageFeedback(
  messageId: string,
  feedback: -1 | 0 | 1,
): Promise<void> {
  await apiRequest("/api/v1/chat/feedback", {
    method: "POST",
    body: JSON.stringify({ messageId, feedback }),
  });
}

// --- Onboarding ---

export async function getOnboardingFollowups(input: {
  userName: string;
  allyName: string;
  conversation: OnboardingQA[];
  dynamicRound: number;
}): Promise<OnboardingFollowupResponse> {
  return apiRequest<OnboardingFollowupResponse>("/api/v1/onboarding/followup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function completeOnboardingDynamic(input: {
  userName: string;
  allyName: string;
  conversation: OnboardingQA[];
  dailyPingTime: string;
  timezone: string;
}): Promise<OnboardingResponse> {
  return apiRequest<OnboardingResponse>("/api/v1/onboarding/complete", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- User Profile ---

export interface UserProfileData {
  name: string;
  email: string;
  allyName: string;
  dailyPingTime: string | null;
  timezone: string | null;
  occupation: string | null;
  tier: string;
}

export interface UpdateProfileRequest {
  name?: string;
  allyName?: string;
  dailyPingTime?: string;
  timezone?: string;
  occupation?: string;
}

export async function getUserProfile(): Promise<UserProfileData> {
  return apiRequest<UserProfileData>("/api/v1/users/profile");
}

export async function updateUserProfile(
  data: UpdateProfileRequest,
): Promise<UserProfileData> {
  return apiRequest<UserProfileData>("/api/v1/users/profile", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// --- Push Token ---

export async function registerPushToken(token: string): Promise<void> {
  await apiRequest("/api/v1/users/push-token", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

// --- Conversations ---

export async function getConversations(
  limit = 10,
  offset = 0,
): Promise<{ conversations: Conversation[]; total: number }> {
  return apiRequest(`/api/v1/conversations?limit=${limit}&offset=${offset}`);
}

export async function getConversationMessages(
  conversationId: string,
  limit = 50,
  before?: string,
): Promise<{
  conversationId: string;
  messages: Message[];
  hasMore: boolean;
}> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  return apiRequest(`/api/v1/conversations/${conversationId}?${params}`);
}

export async function getConversationStatus(
  conversationId: string,
): Promise<{ messageCount: number; lastMessageAt: string }> {
  return apiRequest(`/api/v1/conversations/${conversationId}/status`);
}

// --- Memory ---

/** Subset of MemoryFact returned by the list endpoint (no embedding or userId). */
export interface MemoryFactItem
  extends Pick<MemoryFact, "id" | "category" | "content" | "confidence"> {
  sourceDate?: string;
}

export async function getMemoryProfile(): Promise<{
  profile: MemoryProfile | null;
}> {
  return apiRequest("/api/v1/memory/profile");
}

export async function getMemoryFacts(
  category?: string,
  limit = 20,
  offset = 0,
): Promise<{ facts: MemoryFactItem[]; total: number }> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (category) params.set("category", category);
  return apiRequest(`/api/v1/memory/facts?${params}`);
}

export async function updateMemoryFact(
  factId: string,
  content: string,
): Promise<{ updated: boolean; factId: string }> {
  return apiRequest(`/api/v1/memory/facts/${factId}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
}

export async function deleteMemoryFact(
  factId: string,
): Promise<{ deleted: boolean }> {
  return apiRequest(`/api/v1/memory/facts/${factId}`, { method: "DELETE" });
}

export async function deleteMemoryProfile(): Promise<{ deleted: boolean }> {
  return apiRequest("/api/v1/memory/profile", { method: "DELETE" });
}

// --- You Screen ---

export interface YouScreenData {
  personalInfo: {
    preferredName: string | null;
    fullName: string | null;
    age: number | null;
    birthday: string | null;
    location: string | null;
    livingSituation: string | null;
  };
  relationships: Array<{
    name: string;
    relation: string;
    notes: string;
    lastMentioned: string | null;
  }>;
  goals: Array<{
    description: string;
    category: string;
    status: string;
    progressNotes: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  upcomingEvents: Array<{
    id: string;
    content: string;
    eventDate: string;
    context: string | null;
  }>;
  emotionalPatterns: {
    primaryStressors: string[];
    copingMechanisms: string[];
    moodTrends: Array<{ period: string; trend: string; notes: string }>;
    recurringThemes: string[];
    sensitivities: string[];
  };
  dynamicAttributes: Record<
    string,
    { value: string; confidence: number; learnedAt: string }
  >;
  recentEpisodes: Array<{
    id: string;
    content: string;
    emotion: string | null;
    category: string;
    date: string;
  }>;
  completenessSignal: Record<
    "work" | "relationships" | "health" | "emotionalPatterns" | "interests",
    "clear" | "emerging" | "fuzzy"
  >;
  tier: string;
}

export async function getYouScreen(): Promise<YouScreenData> {
  return apiRequest<YouScreenData>("/api/v1/profile/you");
}

// --- Briefing ---

export async function getTodayBriefing(): Promise<{
  briefing: Briefing | null;
}> {
  return apiRequest("/api/v1/briefing");
}

export async function getBriefingHistory(
  limit = 7,
  offset = 0,
): Promise<{ briefings: Briefing[]; limit: number; offset: number }> {
  return apiRequest(
    `/api/v1/briefing/history?limit=${limit}&offset=${offset}`,
  );
}

// --- Insights (Premium) ---

export async function getWeeklyInsights(
  limit = 4,
  offset = 0,
): Promise<{
  insights: Array<WeeklyInsight & { id: string; delivered: boolean; createdAt: string }>;
  limit: number;
  offset: number;
} | null> {
  try {
    return await apiRequest(
      `/api/v1/insights/weekly?limit=${limit}&offset=${offset}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return null;
    throw err;
  }
}

// --- Health ---

export async function checkHealth(): Promise<{
  status: string;
  version: string;
}> {
  const res = await fetch(`${API_URL}/api/v1/health`);
  return res.json();
}
