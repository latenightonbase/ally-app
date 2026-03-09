import { authClient } from "./auth";

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
    throw new ApiError(message, res.status);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// --- Chat ---

export interface ChatResponse {
  response: string;
  conversationId: string;
  messageId: string;
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

export interface StreamCallbacks {
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
  callbacks: StreamCallbacks,
  conversationId?: string,
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message, conversationId, stream: true }),
    credentials: "omit",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    callbacks.onError(body?.error?.message ?? "Chat request failed");
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError("No response stream available");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
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
}

// --- Onboarding ---

export interface OnboardingAnswers {
  nameAndGreeting: string;
  lifeContext: string;
  currentFocus: string;
  stressAndSupport: string;
  allyExpectations: string;
}

export interface OnboardingResponse {
  greeting: string;
  memoryProfileCreated: boolean;
}

export async function submitOnboarding(
  answers: OnboardingAnswers,
): Promise<OnboardingResponse> {
  return apiRequest<OnboardingResponse>("/api/v1/onboarding", {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}

// --- Conversations ---

export interface ConversationSummary {
  id: string;
  preview: string | null;
  messageCount: number;
  createdAt: string;
  lastMessageAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "ally";
  content: string;
  createdAt: string;
}

export async function getConversations(
  limit = 10,
  offset = 0,
): Promise<{ conversations: ConversationSummary[]; total: number }> {
  return apiRequest(`/api/v1/conversations?limit=${limit}&offset=${offset}`);
}

export async function getConversationMessages(
  conversationId: string,
  limit = 50,
  before?: string,
): Promise<{
  conversationId: string;
  messages: ConversationMessage[];
  hasMore: boolean;
}> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  return apiRequest(`/api/v1/conversations/${conversationId}?${params}`);
}

// --- Memory ---

export interface MemoryProfile {
  userId: string;
  version: number;
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
  }>;
  work: {
    role: string | null;
    company: string | null;
  };
  interests: Array<{
    topic: string;
    detail: string | null;
  }>;
  goals: Array<{
    description: string;
    category: string;
    status: string;
  }>;
  emotionalPatterns: {
    primaryStressors: string[];
    copingMechanisms: string[];
  };
  pendingFollowups: Array<{
    topic: string;
    context: string;
    resolved: boolean;
  }>;
  updatedAt: string;
}

export interface MemoryFactItem {
  id: string;
  category: string;
  content: string;
  sourceDate?: string;
  confidence: number;
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

export async function deleteMemoryFact(
  factId: string,
): Promise<{ deleted: boolean }> {
  return apiRequest(`/api/v1/memory/facts/${factId}`, { method: "DELETE" });
}

export async function deleteMemoryProfile(): Promise<{ deleted: boolean }> {
  return apiRequest("/api/v1/memory/profile", { method: "DELETE" });
}

// --- Briefing ---

export interface BriefingData {
  id: string;
  date: string;
  content: string;
  delivered: boolean;
  createdAt: string;
}

export async function getTodayBriefing(): Promise<{
  briefing: BriefingData | null;
}> {
  return apiRequest("/api/v1/briefing");
}

// --- Health ---

export async function checkHealth(): Promise<{
  status: string;
  version: string;
}> {
  const res = await fetch(`${API_URL}/api/v1/health`);
  return res.json();
}
