# Ally API Documentation

Base URL: `https://api.ally-app.com/v1` (production) | `http://localhost:3000/v1` (local)

All endpoints require authentication unless noted otherwise.

---

## Authentication

The mobile team's auth service issues JWTs. Every request to the Ally backend must include the token in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

**JWT Payload (expected structure):**

```json
{
  "sub": "user-uuid-here",
  "email": "user@example.com",
  "tier": "pro",
  "trial_ends_at": "2026-04-01T00:00:00Z",
  "iat": 1709500000,
  "exp": 1709586400
}
```

The backend verifies the JWT signature using the shared `JWT_SECRET` but does not issue tokens. Token refresh is handled entirely by the mobile team's auth service.

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
| `TOKEN_EXPIRED`          | 401    | JWT has expired, client should refresh            |
| `FORBIDDEN`              | 403    | User's tier does not allow this feature           |
| `NOT_FOUND`              | 404    | Requested resource does not exist                 |
| `RATE_LIMIT_EXCEEDED`    | 429    | Daily message limit reached for user's tier       |
| `VALIDATION_ERROR`       | 422    | Request body failed validation                    |
| `AI_UNAVAILABLE`         | 503    | Claude API is down or timed out                   |
| `INTERNAL_ERROR`         | 500    | Unexpected server error                           |

---

## Rate Limiting

Rate limits are enforced per user based on their subscription tier:

| Tier        | Chat messages/day | Requests/minute |
|-------------|-------------------|-----------------|
| Free Trial  | 20                | 10              |
| Basic       | 50                | 15              |
| Pro         | Unlimited         | 30              |
| Premium     | Unlimited         | 60              |

Rate limit headers are included in every response:

```
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1709600000
```

---

## Endpoints

### POST /api/chat

Send a message to Ally and receive a response.

**Request:**

```json
{
  "message": "I had a really tough day at work today.",
  "conversation_id": "conv-uuid-here"
}
```

| Field             | Type   | Required | Description                                            |
|-------------------|--------|----------|--------------------------------------------------------|
| `message`         | string | Yes      | The user's message (max 4000 characters)               |
| `conversation_id` | string | No       | Existing conversation ID. Omit to start a new one.     |

**Response (200):**

```json
{
  "response": "I'm sorry to hear that. You mentioned last week that the project deadline was stressing you out -- is that what made today tough, or was it something new?",
  "conversation_id": "conv-uuid-here",
  "message_id": "msg-uuid-here"
}
```

| Field             | Type   | Description                                |
|-------------------|--------|--------------------------------------------|
| `response`        | string | Ally's response message                    |
| `conversation_id` | string | Conversation ID (new or existing)          |
| `message_id`      | string | Unique ID for Ally's response message      |

**Example:**

```bash
curl -X POST http://localhost:3000/v1/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I had a really tough day at work today.",
    "conversation_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

---

### POST /api/onboarding

Submit onboarding answers to create an initial memory profile and receive Ally's first personalized greeting.

**Request:**

```json
{
  "answers": {
    "name_and_greeting": "I'm Sarah, you can call me Sar",
    "life_context": "I'm a product manager at a startup. Living in Austin with my partner and our dog.",
    "current_focus": "Trying to get promoted this quarter and also training for a half marathon.",
    "stress_and_support": "Work deadlines stress me out the most. I usually vent to my best friend Maya.",
    "ally_expectations": "I want someone to check in on me and help me stay on track with my goals."
  }
}
```

| Field                        | Type   | Required | Description                                    |
|------------------------------|--------|----------|------------------------------------------------|
| `answers.name_and_greeting`  | string | Yes      | How user wants to be addressed                 |
| `answers.life_context`       | string | Yes      | Basic life situation                           |
| `answers.current_focus`      | string | Yes      | What they're focused on right now              |
| `answers.stress_and_support` | string | Yes      | Stress sources and coping mechanisms           |
| `answers.ally_expectations`  | string | Yes      | What they want from Ally                       |

**Response (201):**

```json
{
  "greeting": "Hey Sar! I'm really glad to meet you. It sounds like you've got a lot of exciting things going on -- a promotion push AND a half marathon? That's impressive. I'll be here whenever you need to talk through the work stress or celebrate a good training run. And I'll definitely check in to make sure you're staying on track. How's the marathon training going so far?",
  "memory_profile_created": true
}
```

**Example:**

```bash
curl -X POST http://localhost:3000/v1/api/onboarding \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "answers": {
      "name_and_greeting": "I'\''m Sarah, you can call me Sar",
      "life_context": "Product manager at a startup in Austin.",
      "current_focus": "Getting promoted and training for a half marathon.",
      "stress_and_support": "Work deadlines. I vent to my friend Maya.",
      "ally_expectations": "Check in on me and help me stay on track."
    }
  }'
```

---

### GET /api/briefing

Retrieve the user's morning briefing for today.

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
    "created_at": "2026-03-04T05:00:00Z"
  }
}
```

**Tier restriction:** Pro and Premium only. Returns 403 for Free Trial and Basic users.

**Example:**

```bash
curl http://localhost:3000/v1/api/briefing \
  -H "Authorization: Bearer $TOKEN"

# Specific date
curl "http://localhost:3000/v1/api/briefing?date=2026-03-03" \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /api/briefing/history

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
      "created_at": "2026-03-04T05:00:00Z"
    },
    {
      "id": "brief-uuid-2",
      "date": "2026-03-03",
      "content": "Hey Sar, happy Monday! ...",
      "delivered": true,
      "created_at": "2026-03-03T05:00:00Z"
    }
  ],
  "total": 28,
  "limit": 7,
  "offset": 0
}
```

**Tier restriction:** Pro and Premium only.

**Example:**

```bash
curl "http://localhost:3000/v1/api/briefing/history?limit=5&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /api/memory/profile

Retrieve the user's memory profile (what Ally remembers about them).

**Response (200):**

```json
{
  "profile": {
    "user_id": "user-uuid-here",
    "personal_info": {
      "preferred_name": "Sar",
      "full_name": "Sarah",
      "location": "Austin, TX",
      "living_situation": "Lives with partner and dog"
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
      "company_type": "Startup",
      "current_goals": ["Get promoted this quarter"],
      "stressors": ["Project deadlines"]
    },
    "health": {
      "fitness_goals": ["Training for half marathon"],
      "current_routine": "Following a training plan"
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
    "emotional_patterns": {
      "primary_stressors": ["Work deadlines"],
      "coping_mechanisms": ["Talking to Maya"],
      "mood_trends": []
    },
    "updated_at": "2026-03-04T02:15:00Z"
  }
}
```

**Example:**

```bash
curl http://localhost:3000/v1/api/memory/profile \
  -H "Authorization: Bearer $TOKEN"
```

---

### DELETE /api/memory/profile

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
curl -X DELETE http://localhost:3000/v1/api/memory/profile \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /api/memory/facts

List individual facts Ally has stored, with optional filtering.

**Query Parameters:**

| Param      | Type   | Required | Description                                                     |
|------------|--------|----------|-----------------------------------------------------------------|
| `category` | string | No       | Filter by category (personal_info, relationships, work, etc.)   |
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
      "source_date": "2026-03-01",
      "confidence": 0.95
    },
    {
      "id": "fact-uuid-2",
      "category": "work",
      "content": "Has a big presentation on March 4",
      "source_date": "2026-03-02",
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
curl "http://localhost:3000/v1/api/memory/facts?category=work&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

---

### DELETE /api/memory/facts/:factId

Delete a specific fact from the user's memory.

**Response (200):**

```json
{
  "deleted": true,
  "fact_id": "fact-uuid-1"
}
```

**Example:**

```bash
curl -X DELETE http://localhost:3000/v1/api/memory/facts/fact-uuid-1 \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /api/conversations

List the user's conversations.

**Query Parameters:**

| Param   | Type   | Required | Description                                    |
|---------|--------|----------|------------------------------------------------|
| `limit` | number | No       | Number of conversations to return (default 10, max 50) |
| `offset`| number | No       | Pagination offset (default 0)                  |

**Response (200):**

```json
{
  "conversations": [
    {
      "id": "conv-uuid-1",
      "preview": "I had a really tough day at work today...",
      "message_count": 12,
      "created_at": "2026-03-04T14:30:00Z",
      "last_message_at": "2026-03-04T15:45:00Z"
    }
  ],
  "total": 23,
  "limit": 10,
  "offset": 0
}
```

**Example:**

```bash
curl "http://localhost:3000/v1/api/conversations?limit=5" \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /api/conversations/:conversationId

Retrieve full message history for a conversation.

**Query Parameters:**

| Param   | Type   | Required | Description                                 |
|---------|--------|----------|---------------------------------------------|
| `limit` | number | No       | Number of messages to return (default 50, max 200) |
| `before`| string | No       | Message ID to paginate before               |

**Response (200):**

```json
{
  "conversation_id": "conv-uuid-1",
  "messages": [
    {
      "id": "msg-uuid-1",
      "role": "user",
      "content": "I had a really tough day at work today.",
      "created_at": "2026-03-04T14:30:00Z"
    },
    {
      "id": "msg-uuid-2",
      "role": "ally",
      "content": "I'm sorry to hear that. You mentioned last week that the project deadline was stressing you out -- is that what made today tough?",
      "created_at": "2026-03-04T14:30:05Z"
    }
  ],
  "has_more": false
}
```

**Example:**

```bash
curl http://localhost:3000/v1/api/conversations/conv-uuid-1 \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /api/insights/weekly

Retrieve the user's weekly emotional insight summary. Premium only.

**Response (200):**

```json
{
  "insight": {
    "week_of": "2026-02-24",
    "summary": "This was a high-energy week for you, Sar. You talked a lot about the upcoming presentation and I noticed your confidence growing as the week went on. Work stress was your main theme (mentioned in 4 out of 6 conversations), but you balanced it well with your training runs. One thing I want to flag: you mentioned feeling guilty about not calling your mom twice this week. That seems to weigh on you more than you let on.",
    "mood_trend": "improving",
    "top_themes": ["work stress", "marathon training", "family guilt"],
    "follow_up_suggestions": [
      "Check in about the presentation outcome",
      "Ask about the call with mom"
    ]
  }
}
```

**Tier restriction:** Premium only.

**Example:**

```bash
curl http://localhost:3000/v1/api/insights/weekly \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /api/user/tier

Check the user's current subscription tier and limits.

**Response (200):**

```json
{
  "tier": "pro",
  "messages_today": 12,
  "messages_limit": null,
  "features": {
    "morning_briefings": true,
    "proactive_followups": false,
    "weekly_insights": false,
    "memory_retention_days": null
  },
  "trial_ends_at": null
}
```

**Example:**

```bash
curl http://localhost:3000/v1/api/user/tier \
  -H "Authorization: Bearer $TOKEN"
```

---

## Webhook Endpoints

These endpoints are called by external services, not the mobile app.

### POST /api/webhooks/subscription

Called by the mobile team's Stripe integration when a user's subscription changes.

**Request:**

```json
{
  "user_id": "user-uuid-here",
  "event": "subscription_updated",
  "tier": "premium",
  "effective_at": "2026-03-04T00:00:00Z"
}
```

**Authentication:** Verified via `X-Webhook-Secret` header instead of JWT.

**Response (200):**

```json
{
  "acknowledged": true
}
```

**Example:**

```bash
curl -X POST http://localhost:3000/v1/api/webhooks/subscription \
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "event": "subscription_updated",
    "tier": "premium",
    "effective_at": "2026-03-04T00:00:00Z"
  }'
```

---

## Health Check

### GET /api/health

No authentication required.

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
curl http://localhost:3000/v1/api/health
```
