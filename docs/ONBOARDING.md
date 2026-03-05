# Ally Onboarding Flow

Onboarding is the first interaction a user has with Ally. The goal is to collect enough context to make Ally's very first response feel personal, warm, and like talking to someone who actually listened.

---

## The 5 Questions

### Question 1: Name and Greeting

**Prompt displayed in app:**
> "Hey! I'm Ally. What should I call you? (Tell me however you'd like to introduce yourself.)"

**Why it matters:**
This sets the tone for the entire relationship. By letting users introduce themselves naturally (rather than filling in a "First Name" form field), we get:
- Their preferred name vs. formal name ("Call me Sar" vs. "Sarah")
- Personality cues from how they introduce themselves
- An immediate sense of being heard as a person, not a form entry

**What gets extracted:**
- `personalInfo.preferredName`
- `personalInfo.fullName` (if provided)
- Initial tone calibration (casual vs. formal based on their style)

---

### Question 2: Life Context

**Prompt displayed in app:**
> "Give me the quick snapshot -- what does your life look like right now? (Work, living situation, whatever feels relevant.)"

**Why it matters:**
Gives Ally a baseline understanding of who this person is today. Without this, Ally would need several conversations to piece together basic context. With it, the first real conversation can already reference their world.

**What gets extracted:**
- `personalInfo.location`
- `personalInfo.livingSituation`
- `work.role`, `work.companyType`
- `relationships` (partner, roommates, pets mentioned)
- Any other relevant `personalInfo`

---

### Question 3: Current Focus

**Prompt displayed in app:**
> "What's taking up most of your mental energy right now? Could be a goal, a project, a decision you're wrestling with -- anything."

**Why it matters:**
Identifies what the user is most likely to want to talk about in their first few conversations. This gives Ally something specific to reference and follow up on, making the relationship feel immediately relevant rather than generic.

**What gets extracted:**
- `goals` (with status "active")
- `work.currentProjects` or `work.currentGoals`
- `emotionalPatterns.primaryStressors` (if stress-related)
- `pendingFollowups` (things to proactively ask about)

---

### Question 4: Stress and Support

**Prompt displayed in app:**
> "When things get tough, what does that usually look like for you? And who or what helps you get through it?"

**Why it matters:**
This is the emotional intelligence question. It tells Ally:
- What kind of hard moments to watch for in future conversations
- Whether to offer solutions, space, or just empathy (based on their coping style)
- Who the important support people in their life are
- How to calibrate emotional responses from day one

**What gets extracted:**
- `emotionalPatterns.primaryStressors`
- `emotionalPatterns.copingMechanisms`
- `relationships` (support people mentioned)
- `emotionalPatterns.sensitivities` (if any sensitive topics surface)

---

### Question 5: Expectations for Ally

**Prompt displayed in app:**
> "Last one -- what would make Ally actually useful to you? What do you wish you had more of in your day-to-day?"

**Why it matters:**
Directly shapes how Ally behaves. A user who says "I want accountability" will get check-ins on goals. A user who says "I just want someone to listen" will get a more reflective, less proactive Ally. This prevents the one-size-fits-all problem.

**What gets extracted:**
- Internal configuration flags for Ally's behavior:
  - `proactive_checkins`: true/false
  - `goal_tracking_emphasis`: high/medium/low
  - `emotional_support_emphasis`: high/medium/low
  - `advice_giving`: active/only_when_asked
- Additional `goals` or `interests` mentioned

---

## How Answers Are Processed

### Step 1: User Completes All 5 Questions

The mobile app collects all 5 answers and sends them as a single `POST /api/v1/onboarding` request. The questions are presented one at a time in the app with a conversational, low-pressure UI (not a form).

### Step 2: AI Processing

The backend sends the answers to `apps/api/src/ai/onboarding.ts`, which calls Claude (`claude-sonnet-4-6`) via the Anthropic TypeScript SDK. The system prompt instructs Claude to:

1. Create a structured memory profile from the answers
2. Write a warm, personalized first greeting (2-3 sentences) that shows Ally was listening

The prompt and response format are defined in `apps/api/src/ai/prompts.ts`.

### Step 3: Store and Respond

- The memory profile is saved to the `memory_profiles` table (PostgreSQL JSONB)
- The greeting is returned to the mobile app
- The mobile app displays the greeting as Ally's first message in the chat interface

---

## Expected Mobile App UX Flow

### Screen 1: Welcome
- Ally's logo/avatar
- "Meet Ally -- the friend who never forgets."
- "Let's get to know each other. I have 5 quick questions."
- [Get Started] button

### Screens 2-6: One Question Per Screen
- Ally's avatar at the top
- Question text styled as a chat message from Ally
- Large text input area (multi-line, no character limit displayed but max 500 chars)
- [Next] button (disabled until user types something)
- Progress indicator (1/5, 2/5, etc.)
- Back button to revise previous answers

### Screen 7: Processing
- Brief loading state: "Ally is thinking about what you shared..."
- 2-3 second wait (actual API call typically takes 3-5 seconds)
- Transition to chat interface

### Screen 8: Chat Interface
- Ally's greeting appears as the first message
- User can immediately start chatting
- The onboarding is complete -- there is no separate "profile review" step

### Design Notes for Mobile Team
- Keep the tone conversational, not form-like
- No asterisks or "required" labels -- every question is required but shouldn't feel that way
- Allow users to type as much or as little as they want
- If a user writes a very short answer (under 10 characters), do not block them but consider showing a gentle prompt: "The more you share, the better Ally can be for you."
- The processing screen should feel like anticipation, not waiting

---

## API Integration Guide for Mobile Team

### 1. Collect Answers

Present the 5 questions sequentially and collect responses as strings.

### 2. Submit Onboarding

```http
POST /api/v1/onboarding
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "answers": {
    "nameAndGreeting": "I'm Sarah, you can call me Sar",
    "lifeContext": "Product manager at a startup in Austin. I live with my partner Alex and our dog Benny.",
    "currentFocus": "Trying to get promoted this quarter. Also training for a half marathon in June.",
    "stressAndSupport": "Work deadlines make me spiral. I usually call my best friend Maya or go for a run.",
    "allyExpectations": "I want someone to check in on me and hold me accountable for my goals. And just someone to talk to on rough days."
  }
}
```

### 3. Handle Response

```json
{
  "greeting": "Hey Sar! Really glad to meet you. Sounds like you've got an exciting few months ahead -- chasing a promotion AND a half marathon is no joke. I love that you've got Maya and your runs as your go-to pressure valves. I'm here to keep you on track and be another one of those outlets. So tell me -- how's the training going? Are you following a specific plan?",
  "memoryProfileCreated": true
}
```

### 4. Display Greeting

Show the greeting as Ally's first chat message. The user is now in the main chat experience.

### 5. Error Handling

| Status | Meaning                        | Action                                       |
|--------|--------------------------------|----------------------------------------------|
| 201    | Success                        | Display greeting, transition to chat          |
| 401    | Invalid/expired JWT            | Redirect to login                             |
| 422    | Missing or invalid answers     | Show validation errors, let user fix          |
| 503    | AI service unavailable         | Show "Ally is taking a moment. Try again soon." and offer retry |

### 6. Edge Cases

- **User closes app mid-onboarding:** Store answers locally, resume where they left off
- **User already completed onboarding:** The endpoint returns 409 Conflict. Mobile app should route to chat instead.
- **Very slow response (>10s):** Show a timeout message and offer retry. The backend has a 30-second timeout on AI calls.
