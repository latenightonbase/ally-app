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

// --- Dynamic onboarding types ---

export interface OnboardingQA {
  question: string;
  answer: string;
}

export interface DynamicOnboardingQuestion {
  title: string;
  subtitle?: string;
  type: "text" | "multiline" | "chips" | "choice";
  options?: string[];
  choices?: { label: string; value: string }[];
  placeholder?: string;
}

export interface OnboardingFollowupRequest {
  userName: string;
  allyName: string;
  conversation: OnboardingQA[];
  dynamicRound: number;
}

export interface OnboardingFollowupResponse {
  questions: DynamicOnboardingQuestion[];
  summary: string;
  memoryUpdates: Record<string, unknown>;
}

export interface OnboardingCompleteRequest {
  userName: string;
  allyName: string;
  conversation: OnboardingQA[];
  dailyPingTime: string;
  timezone: string;
}

export interface OnboardingCompleteResponse {
  greeting: string;
  memoryProfileCreated: boolean;
}
