export const DAILY_GREETINGS = [
  "I was thinking about you this morning. Hope today's a good one.",
  "Good to see you! I've got a few things lined up for your day.",
  "Rise and shine! Let's make today count.",
  "Hey there! I saved some thoughts for you overnight.",
  "Morning! I've been looking forward to catching up.",
  "Hope you slept well. Here's what I've got for you today.",
  "Another day, another chance to do something great.",
  "Hey! Just wanted to check in and start your day right.",
  "Good morning! I remembered something I wanted to share.",
  "Welcome back! Let's ease into the day together.",
  "Morning! I kept some things warm for you.",
  "Hey! I hope yesterday was good. Let's make today even better.",
  "Rise and shine! I've got your morning briefing ready.",
  "Good to have you back. Let's see what today holds.",
  "Morning! I was thinking about what you told me yesterday.",
  "Hey there! Ready for a new day? I've got you covered.",
  "Hope your morning is off to a calm start.",
  "I put together some things I think you'll like today.",
  "Morning! Remember, I'm always here when you need me.",
  "Good morning! Let's take today one step at a time.",
];

export interface BriefingSection {
  id: string;
  title: string;
  icon: string;
  content: string;
}

export const MOCK_BRIEFING: BriefingSection[] = [
  {
    id: "thought",
    title: "Daily Thought",
    icon: "💭",
    content:
      "Sometimes the most productive thing you can do is rest. Give yourself permission to slow down today if you need it.",
  },
  {
    id: "remember",
    title: "I Remember",
    icon: "🧠",
    content:
      "You mentioned you've been working on eating healthier. How about trying a new recipe this week? I can help you find one.",
  },
  {
    id: "suggestion",
    title: "Today's Suggestion",
    icon: "✨",
    content:
      "Take 10 minutes for a walk outside today. Fresh air does wonders — trust me, even AI knows that.",
  },
  {
    id: "funfact",
    title: "Fun Fact",
    icon: "🎯",
    content:
      "Did you know that honey never spoils? Archaeologists found 3,000-year-old honey in Egyptian tombs that was still good to eat!",
  },
];

export interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

export const MOCK_ALLY_RESPONSES = [
  "That's really interesting! Tell me more about that.",
  "I hear you. It sounds like that's been weighing on you. Want to talk through it?",
  "That's awesome! I'll remember that about you.",
  "You know what, that reminds me of something you mentioned earlier. You're making progress!",
  "I appreciate you sharing that with me. It means a lot.",
  "That sounds like a great plan! How can I help you stay on track?",
  "I've been thinking about what you said last time. How's that going?",
  "You're doing better than you think. Seriously.",
  "I love that energy! What got you feeling good about this?",
  "Got it. I'll keep that in mind for next time we chat.",
  "That's a really thoughtful way to look at it.",
  "No pressure at all. I'm here whenever you want to talk.",
  "Hmm, let me think about that... I think you should trust your gut on this one.",
  "I remembered you like {interests}, have you done anything fun with that lately?",
  "You know, {name}, you've really grown since we started talking.",
];

export interface Memory {
  id: string;
  category: "interests" | "goals" | "preferences" | "moments";
  text: string;
  createdAt: Date;
}

export const MEMORY_CATEGORIES = {
  interests: { label: "Interests", icon: "heart" as const, emoji: "❤️" },
  goals: { label: "Goals", icon: "target" as const, emoji: "🎯" },
  preferences: { label: "Preferences", icon: "sliders-horizontal" as const, emoji: "⚙️" },
  moments: { label: "Important Moments", icon: "bookmark" as const, emoji: "📌" },
};

export function createInitialMemories(user: {
  name: string;
  job: string;
  challenges: string;
  interests: string[];
  briefingTime: string;
}): Memory[] {
  const memories: Memory[] = [];
  const now = new Date();

  if (user.job) {
    memories.push({
      id: "mem-job",
      category: "moments",
      text: `Works as: ${user.job}`,
      createdAt: now,
    });
  }

  if (user.challenges) {
    memories.push({
      id: "mem-challenges",
      category: "goals",
      text: `Current challenge: ${user.challenges}`,
      createdAt: now,
    });
  }

  user.interests.forEach((interest, i) => {
    memories.push({
      id: `mem-interest-${i}`,
      category: "interests",
      text: `Enjoys ${interest.toLowerCase()}`,
      createdAt: now,
    });
  });

  memories.push({
    id: "mem-briefing",
    category: "preferences",
    text: `Prefers morning briefing at ${user.briefingTime}`,
    createdAt: now,
  });

  memories.push({
    id: "mem-name",
    category: "preferences",
    text: `Likes to be called ${user.name}`,
    createdAt: now,
  });

  return memories;
}

export function getGreetingByTime(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function getDailyGreeting(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  return DAILY_GREETINGS[dayOfYear % DAILY_GREETINGS.length];
}

export function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
