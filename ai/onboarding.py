"""
Ally AI — Onboarding processor.

Takes the user's five onboarding answers and uses Claude to produce a
structured initial memory profile.

The five onboarding questions are:
1. "What should I call you?"
2. "What does a typical day look like for you?"
3. "What's something you're working toward right now?"
4. "Who are the important people in your life?"
5. "What time do you usually wake up?"

Stdin schema:
{
  "userId": "...",
  "answers": {
    "name": "...",
    "typicalDay": "...",
    "currentGoal": "...",
    "importantPeople": "...",
    "wakeUpTime": "..."
  }
}

Stdout schema:
{
  "memoryProfile": {
    "name": "...",
    "keyFacts": [...],
    "relationships": [...],
    "goals": [...],
    "interests": [...],
    "routine": { "wakeUpTime": "...", "description": "..." },
    "preferences": {},
    "recentEmotionalContext": [],
    "pendingFollowups": []
  },
  "briefingTime": "HH:MM",
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

SYSTEM_PROMPT = """\
You are a data structuring engine for Ally, a personal AI companion app.

You will receive a new user's answers to five onboarding questions. Your job
is to parse these free-text answers into a clean, structured memory profile
that Ally can use from day one.

Return ONLY valid JSON matching this schema:
{
  "name": "the name/nickname they want to be called",
  "keyFacts": ["list of key facts extracted from their answers"],
  "relationships": [
    "Name - relationship (any context mentioned)"
  ],
  "goals": ["goals or things they're working toward"],
  "interests": ["interests or hobbies mentioned or implied"],
  "routine": {
    "wakeUpTime": "HH:MM in 24h format",
    "description": "brief summary of their typical day"
  },
  "preferences": {},
  "recentEmotionalContext": [],
  "pendingFollowups": []
}

Rules:
- Extract the name/nickname exactly as given.
- Parse relationships carefully — extract names and relationship types.
- Infer interests from the typical-day description if reasonable.
- Convert wake-up time to 24h HH:MM format (e.g., "7am" -> "07:00").
- If an answer is vague, extract what you can and leave the rest empty.
- Do NOT invent facts that aren't in the answers.

No markdown fences. No commentary outside the JSON.\
"""


def process_onboarding(
    user_id: str,
    answers: dict[str, str],
) -> dict[str, Any]:
    """
    Process onboarding answers into a structured memory profile.

    Returns a dict with ``memoryProfile``, ``briefingTime``, and
    ``tokensUsed``.
    """

    client = anthropic.Anthropic()

    user_message = (
        "Here are the new user's onboarding answers:\n\n"
        f'1. What should I call you?\n"{answers.get("name", "")}"\n\n'
        f'2. What does a typical day look like for you?\n"{answers.get("typicalDay", "")}"\n\n'
        f'3. What\'s something you\'re working toward right now?\n"{answers.get("currentGoal", "")}"\n\n'
        f'4. Who are the important people in your life?\n"{answers.get("importantPeople", "")}"\n\n'
        f'5. What time do you usually wake up?\n"{answers.get("wakeUpTime", "")}"\n\n'
        "Parse these into the structured memory profile."
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    raw_text = response.content[0].text

    try:
        profile = json.loads(raw_text)
    except json.JSONDecodeError:
        # Fallback: build a minimal profile from the raw answers.
        profile = {
            "name": answers.get("name", "Friend"),
            "keyFacts": [],
            "relationships": [],
            "goals": [answers.get("currentGoal", "")] if answers.get("currentGoal") else [],
            "interests": [],
            "routine": {
                "wakeUpTime": answers.get("wakeUpTime", "08:00"),
                "description": answers.get("typicalDay", ""),
            },
            "preferences": {},
            "recentEmotionalContext": [],
            "pendingFollowups": [],
        }

    # Derive briefing time: 15 minutes after wake-up.
    wake_time = profile.get("routine", {}).get("wakeUpTime", "08:00")
    briefing_time = _compute_briefing_time(wake_time)

    return {
        "memoryProfile": profile,
        "briefingTime": briefing_time,
        "tokensUsed": {
            "input": response.usage.input_tokens,
            "output": response.usage.output_tokens,
        },
    }


def _compute_briefing_time(wake_time: str) -> str:
    """
    Compute the briefing time as 15 minutes after the wake-up time.

    Expects HH:MM in 24h format. Returns HH:MM.
    """
    try:
        parts = wake_time.strip().split(":")
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        minute += 15
        if minute >= 60:
            minute -= 60
            hour = (hour + 1) % 24
        return f"{hour:02d}:{minute:02d}"
    except (ValueError, IndexError):
        return "08:15"


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(f"Invalid JSON on stdin: {exc}", file=sys.stderr)
        sys.exit(1)

    for key in ("userId", "answers"):
        if key not in payload:
            print(f"Missing required field: {key}", file=sys.stderr)
            sys.exit(1)

    answers = payload["answers"]
    required_answers = ("name", "typicalDay", "currentGoal", "importantPeople", "wakeUpTime")
    for key in required_answers:
        if key not in answers:
            print(f"Missing onboarding answer: {key}", file=sys.stderr)
            sys.exit(1)

    try:
        result = process_onboarding(
            user_id=payload["userId"],
            answers=answers,
        )
    except anthropic.APIError as exc:
        print(f"Anthropic API error: {exc}", file=sys.stderr)
        sys.exit(1)

    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
