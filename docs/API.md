# Ally API Documentation

Base URL: `https://api.ally-app.com/api/v1` (production) | `http://localhost:3000/api/v1` (local)

All endpoints require authentication unless noted otherwise.

---

## Authentication

Ally uses **better-auth** for session management. The backend issues and owns all auth — there is no external JWT service.

### Sign In / Sign Up

Auth flows go through the better-auth endpoints mounted at `/api/auth/*` (handled by `lib/auth.ts`). After a successful sign-in, better-auth returns a **session token** (opaque string, not a JWT).

### Sending the Session Token

For mobile clients, include the session token as a Bearer token on every request:

```
Authorization: Bearer <session_token>
```

The session token is stored in `expo-secure-store` on the device and included in all API calls.

### Session Validation

The backend resolves the session via `auth.api.getSession()` on every request. Session data (user id, email, tier) is read from the database — **tier is stored on the user record, not in the token payload**. Token refresh is handled automatically by the better-auth client.

### User Object (resolved per request)

```typescript
{
  id: string,       // User UUID
  email: string,
  tier: "free_trial" | "basic" | "premium"
}
```

---

## Error Format

All errors follow a consistent format:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "You have exceeded your daily message limit. Upgrade to Pro for unlimited messages.",
    "status": 429
  }
}
```

### Error Codes

| Code                     | Status | Description                                      |
|--------------------------|--------|--------------------------------------------------|
| `UNAUTHORIZED`           | 401    | Missing or invalid JWT                           |
| `TOKEN_EXPIRED`          | 401    | JWT has expired, client should refresh           |
| `FORBIDDEN`              | 403    | User's tier does not allow this feature          |
| `NOT_FOUND`              | 404    | Requested resource does not exist                |
| `RATE_LIMIT_EXCEEDED`    | 429    | Daily message limit reached for user's tier      |
| `VALIDATION_ERROR`       | 422    | Request body failed validation                   |
| `AI_UNAVAILABLE`         | 503    | Claude API is down or timed out                  |
| `INTERNAL_ERROR`         | 500    | Unexpected server error                          |

---

## Rate Limiting

Rate limits are enforced per user based on their subscription tier:

| Tier        | Chat messages/day | Requests/minute | Briefings | You screen |
|-------------|-------------------|-----------------|-----------|------------|
| Free Trial  | Unlimited (14 days) | 30            | ✓         | Full       |
| Basic       | Unlimited         | 30              | ✓         | Full       |
| Premium     | Unlimited         | 60              | ✓         | Full       |

Rate limit headers are included in every response:

```
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1709600000
```

---

## Endpoints

### GET /api/v1/health

Health check. No authentication required.

**Response (200):**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 86400
}
```

**Example:**

```bash
curl http://localhost:3000/api/v1/health
```

---

### POST /api/v1/chat

Send a message to Ally and receive a response. Supports both synchronous (JSON) and streaming (SSE) modes.

**Request:**

```json
{
  "message": "I had a really tough day at work today.",
  "conversationId": "conv-uuid-here",
  "stream": false
}
```

| Field             | Type    | Required | Description                                            |
|-------------------|---------|----------|--------------------------------------------------------|
| `message`         | string  | Yes      | The user's message (max 4000 characters)               |
| `conversationId`  | string  | No       | Existing conversation ID. Omit to start a new one.     |
| `stream`          | boolean | No       | If `true`, returns SSE stream instead of JSON. Default `false`. |

#### Synchronous Response (200)

```json
{
  "response": "I'm sorry to hear that. You mentioned last week that the project deadline was stressing you out -- is that what made today tough, or was it something new?",
  "conversationId": "conv-uuid-here",
  "messageId": "msg-uuid-here"
}
```

| Field             | Type   | Description                                |
|-------------------|--------|--------------------------------------------|
| `response`        | string | Ally's response message                    |
| `conversationId`  | string | Conversation ID (new or existing)          |
| `messageId`       | string | Unique ID for Ally's response message      |

#### Streaming Response (SSE)

When `stream: true`, returns `text/event-stream` with the following event types:

```
data: {"type":"token","content":"I'm"}

data: {"type":"token","content":" sorry"}

data: {"type":"token","content":" to hear"}

data: {"type":"done","conversationId":"conv-uuid","messageId":"msg-uuid","fullResponse":"I'm sorry to hear..."}
```

| Event Type | Fields | Description |
|-----------|--------|-------------|
| `token`   | `content` | Individual text token as it's generated |
| `done`    | `conversationId`, `messageId`, `fullResponse` | Final event with complete metadata |
| `error`   | `message` | Sent if streaming fails mid-response |

**Examples:**

```bash
# Synchronous
curl -X POST http://localhost:3000/api/v1/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I had a really tough day at work today.",
    "conversationId": "550e8400-e29b-41d4-a716-446655440000"
  }'

# Streaming
curl -X POST http://localhost:3000/api/v1/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "How are you?", "stream": true}'
```

---

### POST /api/v1/onboarding/followup

Generate the next round of dynamic onboarding questions based on the conversation so far. Called after each round of user answers to decide whether to ask more or wrap up. Optionally persists incremental memory updates as the conversation progresses.

**Request:**

```json
{
  "userName": "Sarah",
  "allyName": "Ally",
  "conversation": [
    { "question": "What's your name and how would you like me to address you?", "answer": "I'm Sarah, you can call me Sar." },
    { "question": "Tell me a bit about your life — where you are, what you do.", "answer": "I'm a product manager at a startup in Austin. Living with my partner and our dog." }
  ],
  "dynamicRound": 1
}
```

| Field           | Type            | Required | Description                                            |
|-----------------|-----------------|----------|--------------------------------------------------------|
| `userName`      | string          | Yes      | User's name (used for personalisation)                 |
| `allyName`      | string          | Yes      | What the user wants to call their AI companion         |
| `conversation`  | array           | Yes      | All Q&A pairs so far (`{ question, answer }`)          |
| `dynamicRound`  | number          | Yes      | Round index (1 = first dynamic round, 2 = second, ...) |

**Response (200):**

```json
{
  "questions": [
    "What are you most focused on right now — work, something personal, a goal you're chasing?",
    "When things get stressful, who or what do you turn to?"
  ],
  "summary": "Sarah is a PM at a startup in Austin. Lives with partner and dog."
}
```

If `questions` is empty, all necessary context has been gathered and the mobile app should call `/onboarding/complete`.

---

### POST /api/v1/onboarding/complete

Finalise onboarding: Claude processes the full conversation into a structured memory profile, creates it in the database, saves notification preferences, and returns Ally's first personalised greeting.

**Request:**

```json
{
  "userName": "Sarah",
  "allyName": "Ally",
  "conversation": [
    { "question": "What's your name and how would you like me to address you?", "answer": "I'm Sarah, you can call me Sar." },
    { "question": "Tell me a bit about your life — where you are, what you do.", "answer": "I'm a product manager at a startup in Austin." },
    { "question": "What are you most focused on right now?", "answer": "Getting promoted this quarter and training for a half marathon." },
    { "question": "When things get stressful, who or what do you turn to?", "answer": "I usually vent to my best friend Maya." }
  ],
  "dailyPingTime": "08:00",
  "timezone": "America/Chicago"
}
```

| Field            | Type    | Required | Description                                         |
|------------------|---------|----------|-----------------------------------------------------|
| `userName`       | string  | Yes      | User's name                                         |
| `allyName`       | string  | Yes      | Name the user chose for their companion             |
| `conversation`   | array   | Yes      | Complete Q&A conversation from onboarding           |
| `dailyPingTime`  | string  | Yes      | Preferred daily check-in time (HH:MM, 24h)          |
| `timezone`       | string  | Yes      | IANA timezone string (e.g. `America/Chicago`)        |

**Response (201):**

```json
{
  "greeting": "Hey Sar! Really glad to meet you. A promotion push AND a half marathon — you've got a lot going on. I'll be here whenever you need to think through the work stuff or celebrate a good training run. How's the marathon prep going so far?",
  "memoryProfileCreated": true
}
```

**Example:**

```bash
curl -X POST http://localhost:3000/api/v1/onboarding/complete \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userName": "Sarah",
    "allyName": "Ally",
    "conversation": [
      { "question": "What'\''s your name?", "answer": "I'\''m Sarah, call me Sar." },
      { "question": "What are you focused on?", "answer": "Promotion and a half marathon." }
    ],
    "dailyPingTime": "08:00",
    "timezone": "America/Chicago"
  }'
```

---

### GET /api/v1/profile/you

Returns the aggregated "You" screen data — a living portrait of the user as Ally understands them. Response shape is tiered.

All tiers (Free Trial, Basic, Premium) receive the full You screen. No fields are locked.

**Response (200):**

```json
{
  "personalInfo": {
    "preferredName": "Sar",
    "fullName": "Sarah",
    "location": "Austin, TX",
    "livingSituation": "Lives with partner and dog"
  },
  "relationships": [ ... ],
  "goals": [ ... ],
  "upcomingEvents": [ ... ],
  "tier": "basic",
  "emotionalPatterns": {
    "primaryStressors": ["Work deadlines"],
    "copingMechanisms": ["Talking to Maya"],
    "moodTrends": [],
    "recurringThemes": ["career pressure", "performance anxiety"],
    "sensitivities": []
  },
  "dynamicAttributes": {
    "work_identity": {
      "value": "Deeply tied to career progress",
      "confidence": 0.85,
      "learnedAt": "2026-03-02T14:30:00Z"
    }
  },
  "recentEpisodes": [
    {
      "id": "ep-uuid-1",
      "content": "Sarah's manager blamed her for a deadline slip in a team meeting",
      "emotion": "frustrated",
      "category": "work",
      "date": "2026-03-04T14:30:00Z"
    }
  ],
  "completenessSignal": {
    "work": "clear",
    "relationships": "emerging",
    "health": "emerging",
    "emotionalPatterns": "clear",
    "interests": "fuzzy"
  }
}
```

`completenessSignal` hints to the UI which sections are well-understood (`"clear"`), partially filled (`"emerging"`), or still unknown (`"fuzzy"`). Use this to render nudges like "Tell Ally more about your interests →".

**Example:**

```bash
curl http://localhost:3000/api/v1/profile/you \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /api/v1/briefing

Retrieve the user's morning briefing for a given date.

**Query Parameters:**

| Param  | Type   | Required | Description                                   |
|--------|--------|----------|-----------------------------------------------|
| `date` | string | No       | ISO date (YYYY-MM-DD). Defaults to today.     |

**Response (200):**

```json
{
  "briefing": {
    "id": "brief-uuid-here",
    "date": "2026-03-04",
    "content": "Good morning, Sar! Here's what's on my mind for you today:\n\nYou mentioned yesterday that your big presentation is this afternoon -- you've been prepping hard and I know you're going to nail it. Remember that breathing technique we talked about if the nerves kick in.\n\nAlso, it's Day 3 of your half marathon training plan. Today's supposed to be an easy 3-mile run. The weather in Austin looks perfect for it -- 65 and sunny.\n\nOne more thing: you said you'd call your mom this week. Maybe tonight after the presentation? You'll probably have good news to share.\n\nHave a great day. I'm here if you need me.",
    "delivered": true,
    "createdAt": "2026-03-04T05:00:00Z"
  }
}
```

Returns `{ "briefing": null }` if no briefing exists for the requested date.

**Tier restriction:** None — available to all tiers.

**Example:**

```bash
curl http://localhost:3000/api/v1/briefing \
  -H "Authorization: Bearer $TOKEN"

# Specific date
curl "http://localhost:3000/api/v1/briefing?date=2026-03-03" \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /api/v1/briefing/history

Retrieve past briefings.

**Query Parameters:**

| Param   | Type   | Required | Description                              |
|---------|--------|----------|------------------------------------------|
| `limit` | number | No       | Number of briefings to return (default 7, max 30) |
| `offset`| number | No       | Pagination offset (default 0)            |

**Response (200):**

```json
{
  "briefings": [
    {
      "id": "brief-uuid-1",
      "date": "2026-03-04",
      "content": "Good morning, Sar! ...",
      "delivered": true,
      "createdAt": "2026-03-04T05:00:00Z"
    },
    {
      "id": "brief-uuid-2",
      "date": "2026-03-03",
      "content": "Hey Sar, happy Monday! ...",
      "delivered": true,
      "createdAt": "2026-03-03T05:00:00Z"
    }
  ],
  "limit": 7,
  "offset": 0
}
```

**Tier restriction:** None — available to all tiers.

**Example:**

```bash
curl "http://localhost:3000/api/v1/briefing/history?limit=5&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /api/v1/memory/profile

Retrieve the user's memory profile (what Ally remembers about them).

**Response (200):**

```json
{
  "profile": {
    "userId": "user-uuid-here",
    "personalInfo": {
      "preferredName": "Sar",
      "fullName": "Sarah",
      "location": "Austin, TX",
      "livingSituation": "Lives with partner and dog"
    },
    "relationships": [
      {
        "name": "Maya",
        "relation": "best friend",
        "notes": "Sarah vents to Maya about work stress"
      },
      {
        "name": "Mom",
        "relation": "mother",
        "notes": "Sarah tries to call weekly"
      }
    ],
    "work": {
      "role": "Product Manager",
      "companyType": "Startup",
      "currentGoals": ["Get promoted this quarter"],
      "stressors": ["Project deadlines"]
    },
    "health": {
      "fitnessGoals": ["Training for half marathon"],
      "currentRoutine": "Following a training plan"
    },
    "interests": [],
    "goals": [
      {
        "description": "Get promoted this quarter",
        "category": "career",
        "status": "active"
      },
      {
        "description": "Complete half marathon",
        "category": "fitness",
        "status": "active"
      }
    ],
    "emotionalPatterns": {
      "primaryStressors": ["Work deadlines"],
      "copingMechanisms": ["Talking to Maya"],
      "moodTrends": []
    },
    "dynamicAttributes": {
      "communication_style": {
        "value": "Direct and results-oriented, rarely complains without a plan",
        "confidence": 0.88,
        "learnedAt": "2026-03-01T10:00:00Z"
      },
      "work_identity": {
        "value": "Deeply tied to career progress — promotion feels personal",
        "confidence": 0.82,
        "learnedAt": "2026-03-02T14:30:00Z"
      }
    },
    "updatedAt": "2026-03-04T02:15:00Z"
  }
}
```

Returns `{ "profile": null }` if no memory profile exists.

**Example:**

```bash
curl http://localhost:3000/api/v1/memory/profile \
  -H "Authorization: Bearer $TOKEN"
```

---

### DELETE /api/v1/memory/profile

Delete the user's entire memory profile. This is irreversible.

**Response (200):**

```json
{
  "deleted": true,
  "message": "Your memory profile has been permanently deleted."
}
```

**Example:**

```bash
curl -X DELETE http://localhost:3000/api/v1/memory/profile \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /api/v1/memory/facts

List individual facts Ally has stored, with optional filtering.

**Query Parameters:**

| Param      | Type   | Required | Description                                                     |
|------------|--------|----------|-----------------------------------------------------------------|
| `category` | string | No       | Filter by category (personalInfo, relationships, work, etc.)    |
| `limit`    | number | No       | Number of facts to return (default 20, max 100)                 |
| `offset`   | number | No       | Pagination offset (default 0)                                   |

**Response (200):**

```json
{
  "facts": [
    {
      "id": "fact-uuid-1",
      "category": "relationships",
      "content": "Best friend is named Maya",
      "sourceDate": "2026-03-01",
      "confidence": 0.95
    },
    {
      "id": "fact-uuid-2",
      "category": "work",
      "content": "Has a big presentation on March 4",
      "sourceDate": "2026-03-02",
      "confidence": 0.90
    }
  ],
  "total": 34,
  "limit": 20,
  "offset": 0
}
```

**Example:**

```bash
curl "http://localhost:3000/api/v1/memory/facts?category=work&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

---

### DELETE /api/v1/memory/facts/:factId

Delete a specific fact from the user's memory.

**Response (200):**

```json
{
  "deleted": true,
  "factId": "fact-uuid-1"
}
```

**Example:**

```bash
curl -X DELETE http://localhost:3000/api/v1/memory/facts/fact-uuid-1 \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /api/v1/conversations

List the user's conversations.

**Query Parameters:**

| Param   | Type   | Required | Description                                    |
|---------|--------|----------|------------------------------------------------|
| `limit` | number | No       | Number of conversations to return (default 10, max 50) |
| `offset`| number | No       | Pagination offset (default 0)                   |

**Response (200):**

```json
{
  "conversations": [
    {
      "id": "conv-uuid-1",
      "preview": "I had a really tough day at work today...",
      "messageCount": 12,
      "createdAt": "2026-03-04T14:30:00Z",
      "lastMessageAt": "2026-03-04T15:45:00Z"
    }
  ],
  "total": 23,
  "limit": 10,
  "offset": 0
}
```

**Example:**

```bash
curl "http://localhost:3000/api/v1/conversations?limit=5" \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /api/v1/conversations/:conversationId

Retrieve full message history for a conversation.

**Query Parameters:**

| Param   | Type   | Required | Description                                 |
|---------|--------|----------|---------------------------------------------|
| `limit` | number | No       | Number of messages to return (default 50, max 200) |
| `before`| string | No       | Message ID (UUID) to paginate before        |

**Response (200):**

```json
{
  "conversationId": "conv-uuid-1",
  "messages": [
    {
      "id": "msg-uuid-1",
      "role": "user",
      "content": "I had a really tough day at work today.",
      "createdAt": "2026-03-04T14:30:00Z"
    },
    {
      "id": "msg-uuid-2",
      "role": "ally",
      "content": "I'm sorry to hear that. You mentioned last week that the project deadline was stressing you out -- is that what made today tough?",
      "createdAt": "2026-03-04T14:30:05Z"
    }
  ],
  "hasMore": false
}
```

**Example:**

```bash
curl http://localhost:3000/api/v1/conversations/conv-uuid-1 \
  -H "Authorization: Bearer $TOKEN"

# With pagination
curl "http://localhost:3000/api/v1/conversations/conv-uuid-1?limit=50&before=msg-uuid-1" \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /api/v1/insights/weekly

Retrieve the user's weekly emotional insight summary.

**Response (200):**

```json
{
  "insight": {
    "weekOf": "2026-02-24",
    "summary": "This was a high-energy week for you, Sar. You talked a lot about the upcoming presentation and I noticed your confidence growing as the week went on. Work stress was your main theme (mentioned in 4 out of 6 conversations), but you balanced it well with your training runs. One thing I want to flag: you mentioned feeling guilty about not calling your mom twice this week. That seems to weigh on you more than you let on.",
    "moodTrend": "improving",
    "topThemes": ["work stress", "marathon training", "family guilt"],
    "followUpSuggestions": [
      "Check in about the presentation outcome",
      "Ask about the call with mom"
    ]
  }
}
```

Returns `{ "insight": null, "message": "..." }` when no insight is available (e.g., insufficient data).

**Tier restriction:** Premium only.

**Example:**

```bash
curl http://localhost:3000/api/v1/insights/weekly \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /api/v1/users/profile

Returns the current user's editable preferences. Used by the Settings screen to populate all edit fields on mount. Includes occupation from the hot-tier memory profile.

**Response (200):**

```json
{
  "name": "Alex",
  "email": "alex@example.com",
  "allyName": "Ally",
  "dailyPingTime": "09:00",
  "timezone": "America/New_York",
  "occupation": "Software Engineer",
  "tier": "basic"
}
```

`dailyPingTime`, `timezone`, and `occupation` may be `null` if not yet set.

**Example:**

```bash
curl http://localhost:3000/api/v1/users/profile \
  -H "Authorization: Bearer $TOKEN"
```

---

### PATCH /api/v1/users/profile

Updates the user's editable profile fields. All fields are optional — only provided fields are updated. Name changes are synced into the hot-tier memory profile (`personalInfo.preferredName`) so the AI sees the new name immediately. Occupation is stored in `memory_profiles.work.role`.

**Request body (all optional):**

```json
{
  "name": "Alex",
  "allyName": "Atlas",
  "dailyPingTime": "09:00",
  "timezone": "America/Chicago",
  "occupation": "Product Manager"
}
```

Constraints:
- `name`: 1–100 characters
- `allyName`: 1–50 characters
- `occupation`: max 100 characters
- `dailyPingTime`: `"HH:MM"` 24-hour format (e.g. `"09:00"`)
- `timezone`: IANA timezone string (e.g. `"America/New_York"`)

When `dailyPingTime` or `timezone` is updated, the other is preserved from the existing record.

**Response (200):**

```json
{
  "updated": true,
  "name": "Alex",
  "email": "alex@example.com",
  "allyName": "Atlas",
  "dailyPingTime": "09:00",
  "timezone": "America/Chicago",
  "occupation": "Product Manager",
  "tier": "basic"
}
```

**Example:**

```bash
curl -X PATCH http://localhost:3000/api/v1/users/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Alex", "occupation": "Product Manager"}'
```

---

## Webhook Endpoints

These endpoints are called by external services, not the mobile app.

### POST /api/v1/webhooks/subscription

Called by the mobile team's Stripe integration when a user's subscription changes.

**Request:**

```json
{
  "userId": "user-uuid-here",
  "event": "subscription_updated",
  "tier": "premium",
  "effectiveAt": "2026-03-04T00:00:00Z"
}
```

**Authentication:** Verified via `x-webhook-secret` header instead of JWT.

**Response (200):**

```json
{
  "acknowledged": true
}
```

**Example:**

```bash
curl -X POST http://localhost:3000/api/v1/webhooks/subscription \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "event": "subscription_updated",
    "tier": "premium",
    "effectiveAt": "2026-03-04T00:00:00Z"
  }'
```
