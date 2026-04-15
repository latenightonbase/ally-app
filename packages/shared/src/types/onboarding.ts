export interface OnboardingAnswers {
  nameAndGreeting: string;
  familyOverview: string;
  familySchedule: string;
  biggestChallenges: string;
  anziExpectations: string;
}

export interface OnboardingResponse {
  greeting: string;
  memoryProfileCreated: boolean;
  familyCreated: boolean;
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
  /** When true, the user can skip this question without answering */
  optional?: boolean;
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
  familyCreated: boolean;
}
