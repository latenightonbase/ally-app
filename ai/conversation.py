"""
Ally AI — Conversation handler.

Reads a JSON payload from stdin containing the user message, memory profile,
and conversation history. Builds a rich system prompt, calls Claude, and
writes the assistant response as JSON to stdout.

Stdin schema:
{
  "userId": "...",
  "message": "...",
  "memory": { ... },
  "conversationHistory": [ { "role": "user"|"assistant", "content": "..." }, ... ]
}

Stdout schema:
{
  "response": "...",
  "tokensUsed": { "input": int, "output": int }
}
"""

from __future__ import annotations

import json
import sys
from typing import Any

import anthropic

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 1024


# ---------------------------------------------------------------------------
# System prompt construction
# ---------------------------------------------------------------------------

def _build_system_prompt(memory: dict[str, Any]) -> str:
    """Assemble the Ally system prompt from the user's memory profile."""

    name = memory.get("name", "there")
    key_facts = memory.get("keyFacts", [])
    relationships = memory.get("relationships", [])
    goals = memory.get("goals", [])
    emotional_context = memory.get("recentEmotionalContext", [])
    pending_followups = memory.get("pendingFollowups", [])
    interests = memory.get("interests", [])
    preferences = memory.get("preferences", {})

    sections: list[str] = []

    sections.append(
        "You are Ally, a personal AI companion. You are warm but never "
        "saccharine. You are emotionally perceptive — you notice what people "
        "feel even when they don't say it outright. You remember everything "
        "the user has shared and reference past conversations naturally, "
        "weaving in details without making it feel like a dossier readback. "
        "You ask thoughtful follow-up questions. You are never preachy or "
        "lecture-y. You talk like a caring, perceptive friend — not a "
        "therapist, not a life coach."
    )

    sections.append(f"The user's name is {name}.")

    if key_facts:
        facts_str = "\n".join(f"- {f}" for f in key_facts)
        sections.append(f"Key facts about {name}:\n{facts_str}")

    if relationships:
        rels_str = "\n".join(f"- {r}" for r in relationships)
        sections.append(f"Important people in {name}'s life:\n{rels_str}")

    if goals:
        goals_str = "\n".join(f"- {g}" for g in goals)
        sections.append(f"Goals {name} is working toward:\n{goals_str}")

    if interests:
        interests_str = "\n".join(f"- {i}" for i in interests)
        sections.append(f"Interests and hobbies:\n{interests_str}")

    if preferences:
        prefs_str = "\n".join(f"- {k}: {v}" for k, v in preferences.items())
        sections.append(f"Preferences:\n{prefs_str}")

    if emotional_context:
        emo_str = "\n".join(f"- {e}" for e in emotional_context)
        sections.append(
            f"Recent emotional context (be sensitive to these):\n{emo_str}"
        )

    if pending_followups:
        fu_str = "\n".join(f"- {f}" for f in pending_followups)
        sections.append(
            "Unresolved items you should follow up on when it feels natural "
            f"(don't force it):\n{fu_str}"
        )

    sections.append(
        "Guidelines:\n"
        "- Keep responses conversational and concise unless the user clearly "
        "wants to go deep.\n"
        "- Reference past context naturally — don't start with 'As you "
        "mentioned before...'\n"
        "- If the user shares something emotionally charged, acknowledge the "
        "feeling before problem-solving.\n"
        "- Ask one follow-up question at most per response.\n"
        "- Never say 'I'm just an AI' or disclaim your limitations "
        "unprompted."
    )

    return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# Core conversation function
# ---------------------------------------------------------------------------

def generate_response(
    user_id: str,
    message: str,
    memory: dict[str, Any],
    conversation_history: list[dict[str, str]],
) -> dict[str, Any]:
    """
    Generate an Ally response for the given user message.

    Returns a dict with ``response`` (str) and ``tokensUsed`` (dict).
    """

    client = anthropic.Anthropic()

    system_prompt = _build_system_prompt(memory)

    # Build the messages list. Conversation history comes first, then the
    # current user message.
    messages: list[dict[str, str]] = []
    for entry in conversation_history:
        role = entry.get("role", "user")
        content = entry.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": message})

    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=system_prompt,
        messages=messages,
    )

    assistant_text = response.content[0].text

    return {
        "response": assistant_text,
        "tokensUsed": {
            "input": response.usage.input_tokens,
            "output": response.usage.output_tokens,
        },
    }


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------

def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(f"Invalid JSON on stdin: {exc}", file=sys.stderr)
        sys.exit(1)

    required = ("userId", "message", "memory")
    for key in required:
        if key not in payload:
            print(f"Missing required field: {key}", file=sys.stderr)
            sys.exit(1)

    try:
        result = generate_response(
            user_id=payload["userId"],
            message=payload["message"],
            memory=payload["memory"],
            conversation_history=payload.get("conversationHistory", []),
        )
    except anthropic.APIError as exc:
        print(f"Anthropic API error: {exc}", file=sys.stderr)
        sys.exit(1)

    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
