# Ally Onboarding Flow

Onboarding is the first interaction a user has with Ally. The goal is to collect enough context to make Ally's very first response feel personal, warm, and like talking to someone who actually listened — while making the experience feel like a natural conversation, not a form.

---

## Architecture

Onboarding uses a **two-phase dynamic conversation** approach:

1. **Initial seed question** — a single open-ended question asking the user to share a bit about themselves
2. **AI-generated followup round** — Claude generates 2-3 personalized followup questions based on what the user shared
3. **Completion** — the full conversation is processed by Claude into a structured memory profile + personalized greeting

This replaces the old static 5-question flow. The AI adapts to what the user shares — someone who mentions a difficult job situation gets followups about work and stress; someone who mentions hobbies gets asked about them specifically.

---

## API Endpoints

### Phase 1: Followup Generation

```
POST /api/v1/onboarding/followup
Authorization: Bearer <session-cookie>
Content-Type: application/json
```

**Request:**
```json
{
  "userName": "Alex",
  "allyName": "Ally",
  "conversation": [
    {
      "question": "Hey, I'm Ally. Tell me a bit about yourself — where you are in life right now, what takes up your mental energy, whatever feels relevant.",
      "answer": "I'm a software engineer in SF. Just switched jobs last month and it's been hectic. I run to decompress, training for a half marathon in June."
    }
  ],
  "dynamicRound": 1
}
```

**Response:**
```json
{
  "questions": [
    {
      "title": "A half marathon in June — do you have a training plan, or are you building as you go?",
      "subtitle": "That's exciting!",
      "type": "multiline",
      "placeholder": "Tell me about the training..."
    },
    {
      "title": "What made you switch jobs?",
      "subtitle": "New job + hectic sounds like a lot at once.",
      "type": "multiline",
      "placeholder": ""
    },
    {
      "title": "When things get tough, what usually helps you?",
      "subtitle": "Running sounds like part of it — what else?",
      "type": "chips",
      "options": ["Talking to someone", "Time alone", "Exercise", "Music", "Work harder", "Sleep it off"]
    }
  ],
  "summary": "Software engineer who just switched jobs and is training for a June half marathon — that's a lot on your plate. Let me make sure I check in on the right things."
}
```

**Notes:**
- `conversation` is the full exchange so far (all prior questions + answers)
- `dynamicRound` is always `1` in the current implementation (one followup round)
- The `summary` field is a warm acknowledgment to show before the completion step — display it to the user

---

### Phase 2: Onboarding Completion

After the user answers the followup questions, send the full conversation to complete onboarding.

```
POST /api/v1/onboarding/complete
Authorization: Bearer <session-cookie>
Content-Type: application/json
```

**Request:**
```json
{
  "userName": "Alex",
  "allyName": "Ally",
  "conversation": [
    {
      "question": "Hey, I'm Ally. Tell me a bit about yourself...",
      "answer": "I'm a software engineer in SF. Just switched jobs last month..."
    },
    {
      "question": "A half marathon in June — do you have a training plan?",
      "answer": "Following a 16-week plan, currently at week 3. Struggling with the long runs."
    },
    {
      "question": "What made you switch jobs?",
      "answer": "Burned out at my old place. New job pays better but it's still an adjustment."
    },
    {
      "question": "When things get tough, what usually helps?",
      "answer": "Running, honestly. And calling my girlfriend Sarah."
    }
  ],
  "dailyPingTime": "09:00",
  "timezone": "America/Los_Angeles"
}
```

**Response:**
```json
{
  "greeting": "Alex — software engineer in SF training for a June half marathon, freshly into a new job, running to keep sane. I already feel like I know you a little. Long runs being the tough part is real — we can keep an eye on how training's going. Welcome.",
  "memoryProfileCreated": true
}
```

**Notes:**
- `dailyPingTime` is in HH:MM format (24-hour). This sets when Ally sends daily check-ins.
- `timezone` is an IANA timezone string (e.g., `"America/New_York"`, `"Europe/London"`)
- On success (HTTP 201), display the greeting as Ally's first message in chat
- The endpoint creates the memory profile, sets ally name, and configures notification preferences in one step

---

## What Gets Extracted

Claude processes the full conversation and creates:

1. **Structured memory profile** — populated fields in `MemoryProfile`:
   - `personalInfo` (name, location)
   - `work` (role, company, stressors, current goals)
   - `health` (fitness goals, mental health notes)
   - `relationships` (people mentioned with notes)
   - `interests` (hobbies, activities)
   - `goals` (explicit goals, status: "active")
   - `emotionalPatterns` (stressors, coping mechanisms, sensitivities)

2. **Dynamic attributes** — foundational character traits Ally picks up from HOW the user writes and WHAT they share. Not stored in fixed fields — stored in `profile.dynamicAttributes`:
   - Examples: `communication_style`, `relationship_with_work`, `stress_response`
   - These are injected into every Claude system prompt and used to shape Ally's behavior from day one
   - Only populated when something clear and foundational emerges — never invented

3. **Ally's first greeting** — personalized to reference specific things the user shared

---

## Mobile App Flow

### Screen 1: Welcome
- Ally avatar + "Meet Ally — the friend who never forgets"
- "Let's get to know each other. Just tell me about yourself." [Get Started]

### Screen 2: Seed Question
- Single open-ended prompt displayed as an Ally message
- Large multi-line text input
- [Continue] button (enabled once user types ≥ 10 characters)

### Screen 3: AI Followup Questions
- Show the AI-generated `summary` as an Ally bubble first
- Render the 2-3 `questions` from the followup response
  - `multiline` → large text area
  - `text` → single-line input
  - `chips` → multi-select chip group
  - `choice` → single-select chip group
- Each question has a title (the question) and a subtitle (a warm comment)

### Screen 4: Time Picker
- "When should I check in with you each day?"
- Chip selection (Morning 8am / Mid-morning 9am / Noon / Evening 8pm / Night 10pm)

### Screen 5: Processing
- "Ally is getting to know you…" loading state
- Calls `POST /api/v1/onboarding/complete`
- Transitions to chat on success

### Screen 6: Chat (first message)
- The `greeting` from the API appears as Ally's first message
- User can immediately start chatting

---

## Error Handling

| Status | Meaning | Action |
|--------|---------|--------|
| 201 | Success | Show greeting, transition to chat |
| 401 | Not authenticated | Redirect to sign-in |
| 422 | Missing/invalid body | Show validation error, let user retry |
| 503 | Claude unavailable | "Ally is taking a moment. Try again." with retry button |

**Edge cases:**
- User closes mid-onboarding: store answers in AsyncStorage, resume on next open
- Followup questions fail (503): fall through to time picker step, skip followup
- Very short answers: allow submission but Claude will generate more general followups

---

## Incremental Memory Updates

The followup endpoint also returns early memory updates from the user's initial answer via the AI-generated `memoryUpdates` field (sent to the backend automatically). This means that by the time `complete` is called, the profile may already have partial data — the completion step does a final full merge.

This is handled transparently in `routes/onboarding.ts` — the mobile team doesn't need to do anything special.
