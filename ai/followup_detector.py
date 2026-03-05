"""
Ally AI — Emotional moment / follow-up detector.

Scans recent conversations to identify unresolved emotional moments that Ally
should circle back on. Scores each item by urgency and suggests follow-up
timing.

Stdin schema:
{
  "userId": "...",
  "conversations": [
    {
      "conversationId": "...",
      "timestamp": "...",
      "messages": [
        { "role": "user"|"assistant", "content": "...", "timestamp": "..." }
      ]
    }
  ],
  "existingFollowups": [...]
}

Stdout schema:
{
  "followups": [
    {
      "type": "pending_outcome"|"unfinished_conversation"|"expressed_anxiety"|"goal_checkin",
      "summary": "...",
      "context": "...",
      "urgency": 1-5,
      "suggestedTiming": "next_morning"|"in_2_days"|"next_week"|"when_natural",
      "sourceConversationId": "..."
    }
  ],
  "tokensUsed": { "input": int, "output": int }
}
"""

from __future__ import annotations

import json
import sys
from typing import Any

import anthropic

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 1536

VALID_TYPES = frozenset([
    "pending_outcome",
    "unfinished_conversation",
    "expressed_anxiety",
    "goal_checkin",
])

VALID_TIMINGS = frozenset([
    "next_morning",
    "in_2_days",
    "next_week",
    "when_natural",
])

SYSTEM_PROMPT = """\
You are an emotional-awareness engine for Ally, a personal AI companion.

Your job is to read recent conversations and identify moments that deserve a
follow-up. Look for:

1. **Pending outcomes** — The user mentioned an upcoming event whose result
   they haven't shared yet (job interview, medical test, difficult
   conversation they were about to have, application deadline, etc.).

2. **Unfinished difficult conversations** — The user started talking about
   something heavy but the conversation ended or shifted before reaching
   resolution.

3. **Expressed anxieties** — The user voiced worry, stress, or fear about
   something and it wasn't fully addressed or resolved.

4. **Goals without follow-up** — The user mentioned a goal or intention
   (starting a habit, making a change) that hasn't been revisited.

For each item, provide:
- type: one of "pending_outcome", "unfinished_conversation",
  "expressed_anxiety", "goal_checkin"
- summary: a short (1 sentence) description of what to follow up on
- context: a brief note on what the user said, so Ally can reference it
  naturally
- urgency: 1-5 (5 = follow up ASAP, 1 = low priority / whenever natural)
  - 5: Medical results, crisis moments, time-sensitive outcomes
  - 4: Job interviews, important relationship conversations
  - 3: Moderate stress, upcoming deadlines
  - 2: Goals, habits, general check-ins
  - 1: Minor mentions, nice-to-follow-up
- suggestedTiming: "next_morning", "in_2_days", "next_week", or "when_natural"

Rules:
- Do NOT flag routine small talk or casual mentions.
- If the user already shared the outcome in a later conversation, do NOT
  include it.
- Ignore items that already appear in the existing follow-ups list (provided
  below) unless the urgency has changed.
- Return an empty list if nothing warrants follow-up.

Return ONLY valid JSON: { "followups": [...] }
No markdown fences. No commentary outside the JSON.\
"""


def _format_conversations(conversations: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for convo in conversations:
        convo_id = convo.get("conversationId", "unknown")
        ts = convo.get("timestamp", "")
        header = f"--- Conversation {convo_id}"
        if ts:
            header += f" ({ts})"
        header += " ---"
        parts.append(header)
        for msg in convo.get("messages", []):
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            msg_ts = msg.get("timestamp", "")
            prefix = f"[{msg_ts}] " if msg_ts else ""
            parts.append(f"{prefix}{role.upper()}: {content}")
        parts.append("")
    return "\n".join(parts)


def detect_followups(
    user_id: str,
    conversations: list[dict[str, Any]],
    existing_followups: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Detect unresolved emotional moments and follow-up opportunities.

    Returns a dict with ``followups`` (list) and ``tokensUsed``.
    """

    client = anthropic.Anthropic()

    transcript = _format_conversations(conversations)

    user_parts: list[str] = []
    if existing_followups:
        user_parts.append(
            "Existing follow-ups already tracked:\n"
            + json.dumps(existing_followups, indent=2)
        )
    user_parts.append("Recent conversations:\n" + transcript)
    user_parts.append(
        "Identify any unresolved emotional moments or pending items that "
        "deserve a follow-up."
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": "\n\n".join(user_parts)}
        ],
    )

    raw_text = response.content[0].text

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        parsed = {"followups": []}

    # Validate and sanitize each follow-up item.
    valid_items: list[dict[str, Any]] = []
    for item in parsed.get("followups", []):
        item_type = item.get("type", "")
        if item_type not in VALID_TYPES:
            continue

        urgency = item.get("urgency", 2)
        if not isinstance(urgency, int) or urgency < 1:
            urgency = 1
        elif urgency > 5:
            urgency = 5

        timing = item.get("suggestedTiming", "when_natural")
        if timing not in VALID_TIMINGS:
            timing = "when_natural"

        valid_items.append({
            "type": item_type,
            "summary": item.get("summary", ""),
            "context": item.get("context", ""),
            "urgency": urgency,
            "suggestedTiming": timing,
            "sourceConversationId": item.get("sourceConversationId", ""),
        })

    # Sort by urgency descending.
    valid_items.sort(key=lambda x: x["urgency"], reverse=True)

    return {
        "followups": valid_items,
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
        result = detect_followups(
            user_id=payload["userId"],
            conversations=payload["conversations"],
            existing_followups=payload.get("existingFollowups"),
        )
    except anthropic.APIError as exc:
        print(f"Anthropic API error: {exc}", file=sys.stderr)
        sys.exit(1)

    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
