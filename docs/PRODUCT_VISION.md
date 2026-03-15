# Ally — Product Vision

**The friend who never forgets. And pays attention.**

This document is the north star. It describes what Ally is, what it's trying to be, the value it creates at each tier, and the product principles that should guide every decision.

---

## What Ally Is

Most AI assistants are tools. You give them a task, they complete it, the interaction ends. They don't remember you from one session to the next. They don't notice patterns. They don't check in.

Ally is different. It's a relationship.

The mental model is: imagine you had a close friend who happened to have a perfect memory and paid exceptional attention to everything you share. They remember your half marathon goal from three weeks ago and ask how training's going. They notice when you've been stressed three Sundays in a row. They follow up on unresolved things without being asked. They know your communication style, your relationship with failure, the things that actually help you cope.

No app does this today. Most "AI companions" are either task agents or glorified chatbots. Ally's differentiation is the memory layer + the relationship model it enables on top.

**Core product belief:** The data is already there — every conversation generates signal. The question is whether the product uses that data to be genuinely useful, or just stores it.

---

## Tier Structure

There is no permanent free tier. Users sign up and get a **14-day free trial** (full access, no credit card required), after which they must subscribe to continue. Two paid tiers:

### Free Trial — "Meet Ally, 14 days"

New users get the **full Basic experience** for 14 days — no credit card required, no features withheld. The trial is long enough to build a real habit and to feel what it's like when Ally actually knows you.

**Trial includes everything in Basic:**
- Unlimited messages
- Full long-term memory (unlimited retention for the trial duration)
- Full "You" screen — emotional patterns, dynamic attributes, recent story, completeness signal
- Morning briefings

**What they don't get:**
- Proactive check-ins between conversations
- Weekly emotional insights

**The conversion hook:** The trial gives users the full picture. After 14 days, they've experienced morning briefings, they've seen the "You" screen fill in, they've had Ally reference things from two weeks ago. Paying to keep that is a much easier decision than paying to try something they haven't experienced. The first time Ally says "wait, is this related to what you told me about your manager last week?" without being prompted — that's the moment.

---

### Basic — "Ally knows you"

The entry paid tier. Users who convert from the trial keep everything they already had.

**What they get:**
- Unlimited messages
- Full long-term memory — unlimited retention, hybrid retrieval (vector + entity graph + keyword)
- Complete "You" screen — emotional patterns, dynamic attributes, recent story, completeness signal
- Morning briefings — personalized, context-aware daily message
- Full conversation history (unlimited)

**The value:** Ally has built a genuine model of who you are. The "You" screen shows you what Ally knows — and the dynamic attributes section surfaces things about you that nobody had to explicitly tell it. That's remarkable.

---

### Premium — "Ally watches out for you"

For users who want Ally to be genuinely proactive in their life. Not just a companion — an active participant in their growth.

**What they get (everything in Basic, plus):**
- Weekly emotional insights — mood trends, patterns, themes, follow-up suggestions
- Habit detection — Ally automatically identifies behavioral patterns from conversation
- AI-set goals — Ally notices recurring patterns and proposes focus areas (unique to Ally)
- Mood calendar — visual emotional timeline built from episodic memories
- Accountability threads — Ally tracks commitments and checks in on them

**The hook:** "I've noticed Sundays keep being rough for you — this is the third week. Want to work on that? I can pay closer attention."

No other product offers this. The user didn't have to identify the problem. Ally did. That's the moment premium earns itself.

---

## The "You" Screen

The "You" screen is the product identity for the memory layer. It's how users experience the value of everything Ally has stored.

**The problem with the old "Memory Vault":** It was a developer's metaphor. "Here is a database of things we stored about you." Grouped text facts is a filing cabinet view, not a portrait. Nobody finds that magical.

**The new frame: What does Ally think of me?**

The "You" screen is a mirror. It shows the user a living portrait of themselves as Ally understands them.

```
┌──────────────────────────────────────────────────┐
│  [avatar]  Alex                                   │
│  "Shipping a product. Training for June."         │  ← AI-generated one-liner
│  San Francisco · Software Engineer               │
└──────────────────────────────────────────────────┘

  YOUR WORLD           relationship story cards
  WHAT YOU'RE BUILDING  goal cards with progress pulse
  RECENT STORY          episodic timeline (story snippets)
  YOUR PATTERNS         emotional fingerprint — visual
  COMING UP             event cards for next 7 days
  WHAT ALLY NOTICES     dynamic attributes — the unspoken portrait
```

**Key design principles:**
- Every section tells a story, not lists facts
- "Sarah — best friend. Going through a tough job search right now. You two talk when things get hard." beats "Relationship: Sarah (friend)"
- The `dynamicAttributes` section surfaces what Ally learned that wasn't explicitly told
- Episodic memories are a timeline of meaningful moments, not a text dump
- The **completeness signal** creates engagement: "Ally has a clear picture of your work life. Your relationship history is still fuzzy." Users talk more so Ally knows them better

**Tier access:**
- All tiers (Trial, Basic, Premium): full screen — no sections are locked. The upsell for Premium happens through the proactive features and weekly insights, not by hiding the You screen.
- The **completeness signal** is the engagement driver: "Ally has a clear picture of your work life. Your interests are still fuzzy." Users talk more so Ally knows them better.

---

## Dynamic Profile (Emergent Personality Attributes)

`MemoryProfile` has 7 fixed categories. But a person is more than 7 categories. How someone communicates, their relationship with failure, their humor style, their values — these don't fit standard fields and often matter more than where they live or what their job title is.

**Solution: `dynamicAttributes`**

An open-ended key-value map added to `MemoryProfile`:

```typescript
dynamicAttributes?: Record<string, {
  value: string;       // "direct and prefers blunt feedback without softening"
  confidence: number;  // 0–1
  learnedAt: string;   // ISO date
  sourceConversationId?: string;
}>;
```

Populated by:
1. **Real-time extraction** — `EXTRACTION_SYSTEM_PROMPT` emits dynamic attributes when foundational patterns emerge (high bar: only clear, demonstrated patterns)
2. **Onboarding** — `ONBOARDING_COMPLETE_PROMPT` extracts initial personality signals from the onboarding conversation
3. **Weekly consolidation** — `DYNAMIC_PROMOTION_PROMPT` examines high-importance semantic facts and promotes recurring behavioral patterns

Injected into every Claude system prompt as "What Ally has learned about them (patterns observed over time)."

The categories that matter for one person aren't the same as those that matter for another. A rigid schema can never cover all of human personality. This escape hatch lets Ally build a genuine model of *this specific person*.

---

## Design Principles

**Zero friction** — none of the intelligence features require explicit user setup. Habits are detected, not configured. Goals are scaffolded, not entered. Dynamic attributes emerge from conversation, not a profile form.

**Emergent from the relationship** — the data is a byproduct of conversation. Users don't feel tracked; they feel understood.

**Observe, then ask** — Ally surfaces patterns and asks permission before acting on them. It never unilaterally decides the user has a problem. "I've noticed X — want to work on that?" is the pattern.

**Smart silence** — not every pattern needs a check-in. Not every commitment needs follow-through. Over time, Ally builds a model of what this specific user wants to be held to vs. what they want space on.

**Genuine surprise** — the product should occasionally surprise users. The first time Ally surfaces a dynamic attribute ("you handle stress by going quiet — I've noticed that about you"), or asks "how did that interview go?" unprompted — these moments create the emotional attachment that drives retention.

**Transparency on request** — if a user asks "why are you checking in on this?", Ally can explain which observations triggered it. Trust comes from transparency, not magic-black-box behavior.

---

## Open Questions and Evolving Ideas

These are tracked here so they don't get lost, not because they're committed.

- **Ally-to-Ally** — what if two Ally users could optionally share limited context? E.g., "Sarah also uses Ally and has flagged that she's going through a hard time. Ally can reference this without revealing specifics." Privacy-first, opt-in only. Very far out.

- **Integration signals** — Calendar events → `memory_events` without extraction overhead. Health data (steps, sleep) → `memory_facts` with `category: 'health'`. These make the context richer without requiring the user to report.

- **Ally-generated "chapter summaries"** — periodic (monthly?) AI-generated summaries of a user's arc. "Your March was defined by the job switch and starting half marathon training. Here's what changed." Delivered as a premium feature.

- **Emotional support calibration** — during onboarding, Ally infers (and asks to confirm) whether the user wants more solution-oriented or more emotionally-present responses. This becomes a dynamic attribute: `support_style: "prefers space and presence over solutions"`.

- **Memory corrections** — the "You" screen should let users correct or remove things Ally has learned. If a dynamic attribute is wrong, they should be able to fix it. This is basic trust hygiene.

- **Ally-written letters** — for premium users, occasional long-form reflections: "Here's what I've noticed about your last three months." Entirely optional, opt-in, and focused on growth rather than analysis.
