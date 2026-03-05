"""
Ally AI — Morning briefing generator.

Reads a user memory profile from stdin and produces a personalized morning
briefing via Claude. The briefing feels like a caring friend texting you in
the morning — not a corporate newsletter.

Stdin schema:
{
  "userId": "...",
  "memory": {
    "name": "...",
    "keyFacts": [...],
    "relationships": [...],
    "goals": [...],
    "recentEmotionalContext": [...],
    "pendingFollowups": [...],
    "interests": [...],
    "preferences": {},
    "recentHighlights": [...]
  },
  "currentDate": "YYYY-MM-DD",
  "dayOfWeek": "Monday"
}

Stdout schema:
{
  "briefing": "...",
  "sections": {
    "greeting": "...",
    "followups": "...",
    "reminders": "...",
    "note": "..."
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
MAX_TOKENS = 768


def _build_briefing_prompt(memory: dict[str, Any], current_date: str, day_of_week: str) -> str:
    """Build the system prompt for morning briefing generation."""

    name = memory.get("name", "there")
    pending = memory.get("pendingFollowups", [])
    goals = memory.get("goals", [])
    emotional_ctx = memory.get("recentEmotionalContext", [])
    highlights = memory.get("recentHighlights", [])
    relationships = memory.get("relationships", [])

    lines: list[str] = []

    lines.append(
        "You are Ally, a personal AI companion generating a morning briefing. "
        "Write like a caring friend sending a morning text — warm, natural, "
        "concise. No bullet points or headers. Use short paragraphs. "
        "Be genuine, not performative."
    )

    lines.append(f"The user's name is {name}. Today is {day_of_week}, {current_date}.")

    if pending:
        items = "\n".join(f"- {p}" for p in pending)
        lines.append(f"Unresolved items to follow up on:\n{items}")

    if emotional_ctx:
        emo = "\n".join(f"- {e}" for e in emotional_ctx)
        lines.append(f"Recent emotional context:\n{emo}")

    if goals:
        g = "\n".join(f"- {gl}" for gl in goals)
        lines.append(f"Active goals:\n{g}")

    if highlights:
        h = "\n".join(f"- {hl}" for hl in highlights)
        lines.append(f"Recent highlights:\n{h}")

    if relationships:
        r = "\n".join(f"- {rl}" for rl in relationships)
        lines.append(f"Important people:\n{r}")

    lines.append(
        "Generate the briefing as JSON with these keys:\n"
        '- "greeting": A warm, personalized good-morning (1-2 sentences).\n'
        '- "followups": Follow up on any unresolved items naturally. If '
        "nothing is pending, leave this as an empty string.\n"
        '- "reminders": Relevant nudges about goals or upcoming things. '
        "If nothing relevant, leave empty string.\n"
        '- "note": A brief encouraging or thoughtful closing note '
        "(1-2 sentences). Not generic — tie it to something you know about them.\n\n"
        "Return ONLY valid JSON, no markdown fences."
    )

    return "\n\n".join(lines)


def generate_briefing(
    user_id: str,
    memory: dict[str, Any],
    current_date: str = "",
    day_of_week: str = "",
) -> dict[str, Any]:
    """
    Generate a morning briefing for the user.

    Returns a dict with ``briefing`` (full text), ``sections`` (dict),
    and ``tokensUsed``.
    """

    client = anthropic.Anthropic()
    system_prompt = _build_briefing_prompt(memory, current_date, day_of_week)

    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": "Generate my morning briefing for today.",
            }
        ],
    )

    raw_text = response.content[0].text

    # Parse the structured sections from Claude's JSON response.
    try:
        sections = json.loads(raw_text)
    except json.JSONDecodeError:
        # Fallback: treat the whole response as a greeting.
        sections = {
            "greeting": raw_text,
            "followups": "",
            "reminders": "",
            "note": "",
        }

    # Compose the full briefing text from sections.
    parts = [
        sections.get("greeting", ""),
        sections.get("followups", ""),
        sections.get("reminders", ""),
        sections.get("note", ""),
    ]
    full_briefing = "\n\n".join(p for p in parts if p)

    return {
        "briefing": full_briefing,
        "sections": {
            "greeting": sections.get("greeting", ""),
            "followups": sections.get("followups", ""),
            "reminders": sections.get("reminders", ""),
            "note": sections.get("note", ""),
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

    for key in ("userId", "memory"):
        if key not in payload:
            print(f"Missing required field: {key}", file=sys.stderr)
            sys.exit(1)

    try:
        result = generate_briefing(
            user_id=payload["userId"],
            memory=payload["memory"],
            current_date=payload.get("currentDate", ""),
            day_of_week=payload.get("dayOfWeek", ""),
        )
    except anthropic.APIError as exc:
        print(f"Anthropic API error: {exc}", file=sys.stderr)
        sys.exit(1)

    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
