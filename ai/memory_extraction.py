"""
Ally AI — Nightly memory extractor.

Takes a day's worth of conversations for a user and uses Claude to extract
durable facts that should persist in the user's memory profile.

Designed to run nightly as a batch job across all users.

Stdin schema:
{
  "userId": "...",
  "conversations": [
    {
      "conversationId": "...",
      "messages": [
        { "role": "user"|"assistant", "content": "...", "timestamp": "..." }
      ]
    }
  ],
  "existingMemory": { ... }
}

Stdout schema:
{
  "facts": [
    {
      "category": "personal_info"|"relationships"|"work"|"health"|"interests"|"goals"|"emotional_patterns",
      "fact": "...",
      "confidence": 0.0-1.0,
      "source": "conversationId",
      "timestamp": "..."
    }
  ],
  "updatedFields": {
    "name": "..." | null,
    "keyFacts": ["..."],
    "relationships": ["..."],
    "goals": ["..."],
    "interests": ["..."],
    "emotionalPatterns": ["..."]
  },
  "tokensUsed": { "input": int, "output": int }
}
"""

from __future__ import annotations

import json
import sys
from typing import Any

import anthropic

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 2048

VALID_CATEGORIES = frozenset([
    "personal_info",
    "relationships",
    "work",
    "health",
    "interests",
    "goals",
    "emotional_patterns",
])

SYSTEM_PROMPT = """\
You are a memory extraction engine for Ally, a personal AI companion app.

Your job is to read through a day's conversations between Ally and a user and
extract durable facts worth remembering long-term. Focus on:

- Personal information (name, age, location, job, etc.)
- Relationships (family, friends, partners, coworkers — names and context)
- Work details (job title, company, projects, challenges)
- Health (conditions, medications, fitness goals — only if voluntarily shared)
- Interests and hobbies
- Goals (short-term and long-term)
- Emotional patterns (recurring anxieties, sources of joy, coping mechanisms)

Rules:
- Only extract facts the user explicitly stated or strongly implied.
- Do NOT infer personality traits or make psychological assessments.
- Assign a confidence score (0.0-1.0) based on how clearly the fact was stated.
- If a fact contradicts something in the existing memory, include it with a
  note — the application layer will handle conflict resolution.
- Ignore small talk and transient details (weather comments, etc.)

Return ONLY valid JSON matching this schema:
{
  "facts": [
    {
      "category": "personal_info|relationships|work|health|interests|goals|emotional_patterns",
      "fact": "description of the fact",
      "confidence": 0.0-1.0,
      "sourceConversationId": "id or null"
    }
  ],
  "updatedFields": {
    "name": "string or null if unchanged",
    "keyFacts": ["new key facts to add"],
    "relationships": ["new relationship facts"],
    "goals": ["new goals"],
    "interests": ["new interests"],
    "emotionalPatterns": ["new emotional patterns"]
  }
}

No markdown fences. No commentary outside the JSON.\
"""


def _format_conversations(conversations: list[dict[str, Any]]) -> str:
    """Format conversation data into a readable transcript for Claude."""

    parts: list[str] = []
    for convo in conversations:
        convo_id = convo.get("conversationId", "unknown")
        parts.append(f"--- Conversation {convo_id} ---")
        for msg in convo.get("messages", []):
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            timestamp = msg.get("timestamp", "")
            prefix = f"[{timestamp}] " if timestamp else ""
            parts.append(f"{prefix}{role.upper()}: {content}")
        parts.append("")

    return "\n".join(parts)


def extract_memories(
    user_id: str,
    conversations: list[dict[str, Any]],
    existing_memory: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Extract durable facts from a day's conversations.

    Returns a dict with ``facts``, ``updatedFields``, and ``tokensUsed``.
    """

    client = anthropic.Anthropic()

    transcript = _format_conversations(conversations)

    user_message_parts: list[str] = []
    if existing_memory:
        user_message_parts.append(
            "Existing memory profile:\n"
            + json.dumps(existing_memory, indent=2)
        )
    user_message_parts.append(
        "Today's conversations:\n" + transcript
    )
    user_message_parts.append(
        "Extract all durable facts from these conversations."
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": "\n\n".join(user_message_parts)}
        ],
    )

    raw_text = response.content[0].text

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        parsed = {"facts": [], "updatedFields": {}}

    # Validate categories.
    valid_facts = []
    for fact in parsed.get("facts", []):
        if fact.get("category") in VALID_CATEGORIES:
            valid_facts.append(fact)

    updated = parsed.get("updatedFields", {})

    return {
        "facts": valid_facts,
        "updatedFields": {
            "name": updated.get("name"),
            "keyFacts": updated.get("keyFacts", []),
            "relationships": updated.get("relationships", []),
            "goals": updated.get("goals", []),
            "interests": updated.get("interests", []),
            "emotionalPatterns": updated.get("emotionalPatterns", []),
        },
        "tokensUsed": {
            "input": response.usage.input_tokens,
            "output": response.usage.output_tokens,
        },
    }


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(f"Invalid JSON on stdin: {exc}", file=sys.stderr)
        sys.exit(1)

    for key in ("userId", "conversations"):
        if key not in payload:
            print(f"Missing required field: {key}", file=sys.stderr)
            sys.exit(1)

    try:
        result = extract_memories(
            user_id=payload["userId"],
            conversations=payload["conversations"],
            existing_memory=payload.get("existingMemory"),
        )
    except anthropic.APIError as exc:
        print(f"Anthropic API error: {exc}", file=sys.stderr)
        sys.exit(1)

    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
