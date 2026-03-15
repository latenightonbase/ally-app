# Manual Testing Guide

This guide covers how to manually test the Ally API using Postman, curl, and the built-in token generator.

## Prerequisites

1. The API server running locally: `bun run dev` from `apps/api/`
2. A `.env` file in `apps/api/` with valid credentials
3. Database schema pushed: `bun run db:push`

## Generating a Test JWT

Since the API uses JWT authentication, you need a valid token. Use this one-liner to generate one from the project root:

```bash
cd apps/api && bun -e "
import { SignJWT } from 'jose';
const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'your-jwt-secret');
const token = await new SignJWT({ email: 'test@example.com', tier: 'pro' })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject('YOUR_USER_UUID')
  .setIssuedAt()
  .setExpirationTime('24h')
  .sign(secret);
console.log(token);
"
```

Replace `YOUR_USER_UUID` with an actual user ID from your database (or create one first via the webhook endpoint).

Save the output as an environment variable for easy reuse:

```bash
export ALLY_TOKEN="eyJhbG..."
```

## Postman Setup

1. Import `docs/postman/ally-api.postman_collection.json`
2. Import `docs/postman/ally-local.postman_environment.json`
3. In the environment, set:
   - `jwtSecret` to match your `JWT_SECRET` env var
   - `webhookSecret` to match your `WEBHOOK_SECRET` env var
   - `authToken` to the JWT you generated above
4. Select the "Ally Local" environment in Postman

The collection auto-saves `conversationId` when you send a chat message, so follow-up requests work automatically.

## curl Cheatsheet

### Health Check

```bash
curl http://localhost:3000/api/v1/health | jq
```

### Onboarding (Dynamic Flow)

**Step 1 — Generate AI followup questions:**

```bash
curl -X POST http://localhost:3000/api/v1/onboarding/followup \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALLY_TOKEN" \
  -d '{
    "userName": "Alex",
    "allyName": "Ally",
    "conversation": [
      {
        "question": "Hey! I'\''m Ally. Tell me a bit about yourself — where you are in life right now, whatever feels relevant.",
        "answer": "Software engineer in SF. Just switched jobs, kind of hectic. I run to decompress, training for a half marathon in June."
      }
    ],
    "dynamicRound": 1
  }' | jq
```

Save the followup questions and let the user answer them, then:

**Step 2 — Complete onboarding:**

```bash
curl -X POST http://localhost:3000/api/v1/onboarding/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALLY_TOKEN" \
  -d '{
    "userName": "Alex",
    "allyName": "Ally",
    "conversation": [
      {
        "question": "Tell me about yourself...",
        "answer": "Software engineer in SF. Just switched jobs..."
      },
      {
        "question": "Training plan for the half marathon?",
        "answer": "16-week plan, week 3. Long runs are tough."
      }
    ],
    "dailyPingTime": "09:00",
    "timezone": "America/Los_Angeles"
  }' | jq
```

### Chat (non-streaming)

```bash
curl -X POST http://localhost:3000/api/v1/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALLY_TOKEN" \
  -d '{"message": "Hey Ally, how are you?"}' | jq
```

Save the `conversationId` from the response:

```bash
export CONV_ID="uuid-from-response"
```

### Chat (streaming SSE)

```bash
curl -N -X POST http://localhost:3000/api/v1/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALLY_TOKEN" \
  -d '{"message": "Tell me something encouraging", "stream": true}'
```

The `-N` flag disables curl's output buffering so you see tokens as they arrive.

**Expected output:**

```
data: {"type":"token","content":"Hey"}

data: {"type":"token","content":" Alex"}

data: {"type":"token","content":"!"}

...more token events...

data: {"type":"done","conversationId":"...","messageId":"...","fullResponse":"Hey Alex! ..."}
```

Each `data:` line is a JSON object with either `type: "token"` (partial content) or `type: "done"` (final metadata).

### Continue a Conversation

```bash
curl -X POST http://localhost:3000/api/v1/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALLY_TOKEN" \
  -d "{\"message\": \"Thanks, that helped!\", \"conversationId\": \"$CONV_ID\"}" | jq
```

### Memory Profile

```bash
# Get profile
curl http://localhost:3000/api/v1/memory/profile \
  -H "Authorization: Bearer $ALLY_TOKEN" | jq

# Delete profile
curl -X DELETE http://localhost:3000/api/v1/memory/profile \
  -H "Authorization: Bearer $ALLY_TOKEN" | jq
```

### Memory Facts

```bash
# List facts (with optional category filter)
curl "http://localhost:3000/api/v1/memory/facts?limit=20&offset=0" \
  -H "Authorization: Bearer $ALLY_TOKEN" | jq

# Filter by category
curl "http://localhost:3000/api/v1/memory/facts?category=work" \
  -H "Authorization: Bearer $ALLY_TOKEN" | jq

# Delete a fact
curl -X DELETE "http://localhost:3000/api/v1/memory/facts/FACT_UUID" \
  -H "Authorization: Bearer $ALLY_TOKEN" | jq
```

### Conversations

```bash
# List all conversations
curl "http://localhost:3000/api/v1/conversations?limit=20" \
  -H "Authorization: Bearer $ALLY_TOKEN" | jq

# Get messages for a conversation
curl "http://localhost:3000/api/v1/conversations/$CONV_ID" \
  -H "Authorization: Bearer $ALLY_TOKEN" | jq
```

### Briefing (requires pro/premium tier)

```bash
# Get today's briefing
curl http://localhost:3000/api/v1/briefing \
  -H "Authorization: Bearer $ALLY_TOKEN" | jq

# Get briefing for a specific date
curl "http://localhost:3000/api/v1/briefing?date=2026-03-05" \
  -H "Authorization: Bearer $ALLY_TOKEN" | jq

# Briefing history
curl "http://localhost:3000/api/v1/briefing/history?limit=10" \
  -H "Authorization: Bearer $ALLY_TOKEN" | jq
```

### Weekly Insights (requires premium tier)

```bash
curl http://localhost:3000/api/v1/insights/weekly \
  -H "Authorization: Bearer $ALLY_TOKEN" | jq

# With pagination
curl "http://localhost:3000/api/v1/insights/weekly?limit=4&offset=0" \
  -H "Authorization: Bearer $ALLY_TOKEN" | jq
```

### "You" Screen Profile

```bash
# Trial/basic tier — personalInfo, relationships, goals, upcoming events
curl http://localhost:3000/api/v1/profile/you \
  -H "Authorization: Bearer $ALLY_TOKEN" | jq

# Pro/Premium tier — also includes emotionalPatterns, dynamicAttributes, recentEpisodes, completenessSignal
# (generate a pro-tier JWT to test the full response)
```

### Webhook (Subscription Update)

```bash
curl -X POST http://localhost:3000/api/v1/webhooks/subscription \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your-webhook-secret" \
  -d '{
    "userId": "USER_UUID",
    "event": "subscription_updated",
    "tier": "premium",
    "effectiveAt": "2026-03-05T00:00:00Z"
  }' | jq
```

## Debugging Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `401 Unauthorized` | Expired or invalid JWT | Regenerate the token |
| `403 Forbidden` | Wrong tier for the endpoint | Change the `tier` claim in your JWT |
| `422 Unprocessable Entity` | Missing or invalid body fields | Check the request body against `docs/API.md` |
| `429 Rate Limited` | Too many requests per minute | Wait for the rate limit window to reset |
| `503 AI Unavailable` | Claude or Voyage API is down/unreachable | Check your API keys and network |
| SSE shows no output | curl buffering | Add the `-N` flag to curl |
| Empty streaming response | Postman can't render SSE properly | Use curl with `-N` instead |

## Testing the Full Flow

A typical manual testing session:

1. Start the server: `bun run dev`
2. Generate a JWT (see above)
3. Hit health check to verify connectivity
4. POST `/onboarding/followup` to get AI-generated questions
5. POST `/onboarding/complete` to create a memory profile + get greeting
6. Send a few chat messages (non-streaming)
7. Try streaming chat with curl
8. Check memory profile and facts to see what was stored
9. GET `/profile/you` to verify the You screen data
10. List conversations to verify history
11. Continue an existing conversation to test context retention

---

## Mobile Testing Checklist

Start the Expo dev server: `cd apps/mobile && bun run dev`

### Auth Flow
- [ ] **Sign up** — create a new account with email/password; verify redirect to onboarding
- [ ] **Sign in** — sign in with existing credentials; verify redirect to chat tab
- [ ] **Invalid credentials** — wrong password shows an alert (not a crash)
- [ ] **Sign out** — settings → Sign Out → confirm; lands on sign-in screen, Zustand state cleared

### Onboarding Flow
- [ ] **Name + ally name inputs** — accept text and advance correctly to seed question
- [ ] **Seed question** — multiline input works, "Continue" calls `/api/v1/onboarding/followup` and advances to followup phase
- [ ] **Dynamic followup questions** — Claude-generated questions render correctly (multiline, text, chips, choice types)
- [ ] **Followup summary** — warm summary from AI displays before the questions
- [ ] **AI followup failure (503)** — kill the API mid-onboarding; screen gracefully falls through to time picker
- [ ] **Time picker** — chip selection sets daily ping time
- [ ] **Completion** — tapping final "Continue" calls `/api/v1/onboarding/complete`, then navigates to chat with Ally's greeting as first message

### Chat Screen
- [ ] **Send a message** — message appears in the list, TypingIndicator shows, then ally response streams in token by token
- [ ] **SSE streaming** — response text accumulates in the ally bubble (not a new bubble per token)
- [ ] **Error handling** — kill the API mid-stream; error message appears inline as an ally bubble (not a crash)
- [ ] **Suggestion chips** — visible on first open (only 1 message); disappear after first message sent
- [ ] **Input max length** — can't type beyond 500 characters
- [ ] **Disabled state** — send button disabled while streaming

### "You" Screen
- [ ] **Load You screen** — switching to You tab calls `GET /api/v1/profile/you` and renders correctly
- [ ] **Trial/non-pro tier** — personalInfo, relationships, goals, and upcoming events display; pro-locked sections show upgrade prompt
- [ ] **Pro/Premium tier** — emotionalPatterns, dynamicAttributes, recentEpisodes, completenessSignal all render
- [ ] **Dynamic attributes** — if profile has dynamicAttributes, they display as "What Ally notices about you"
- [ ] **Upcoming events** — events within 7 days show in "Coming Up" section
- [ ] **Completeness signal** — "Ally has a clear picture of X. Y is still fuzzy." renders correctly
- [ ] **Empty state** — newly onboarded users with minimal data see appropriate empty states per section

### Memory Facts (Advanced)
- [ ] **Load facts** — `GET /api/v1/memory/facts?limit=20&offset=0` returns facts
- [ ] **Category filter** — `?category=work` returns only work facts
- [ ] **Delete** — tap trash icon → fact removed from list; verify deleted on server
- [ ] **Edit** — update fact content; verify via GET facts
- [ ] **Superseded facts** — `?includeSuperseeded=true` includes superseded facts with `superseded: true` flag
- [ ] **Restore** — `PATCH /api/v1/memory/facts/:id/restore` clears supersededBy pointer

### Settings
- [ ] **Theme picker** — switching themes changes colors across all screens immediately
- [ ] **Theme persistence** — close and reopen app; theme is retained
- [ ] **Clear All Memories** — confirm dialog → calls `DELETE /api/v1/memory/profile`; memory tab shows empty
- [ ] **Reset Ally** — confirm dialog → clears profile and redirects to onboarding
- [ ] **Network error on Clear** — simulate failure; alert shown with error message (not silent)

### Theme / Visual
- [ ] **Dark theme** — switch to any dark theme; all text, icons, and inputs use correct colors (no white-on-white or black-on-black)
- [ ] **ChatInput placeholder** — placeholder and typed text both match the active theme foreground/muted colors
