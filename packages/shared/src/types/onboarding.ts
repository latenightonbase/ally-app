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
