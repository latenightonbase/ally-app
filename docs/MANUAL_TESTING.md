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

### Onboarding

```bash
curl -X POST http://localhost:3000/api/v1/onboarding \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALLY_TOKEN" \
  -d '{
    "answers": {
      "nameAndGreeting": "I'\''m Alex, call me Al",
      "lifeContext": "Software engineer at a startup in SF",
      "currentFocus": "Getting promoted and training for a half marathon",
      "stressAndSupport": "Deadlines stress me. I cope by running.",
      "allyExpectations": "A friend who remembers things and checks in"
    }
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
4. Submit onboarding to create a memory profile
5. Send a few chat messages (non-streaming)
6. Try streaming chat with curl
7. Check memory profile and facts to see what was stored
8. List conversations to verify history
9. Continue an existing conversation to test context retention
