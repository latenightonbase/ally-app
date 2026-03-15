import { db, schema } from "../db";
import { eq, and, isNull, lte, gte, sql } from "drizzle-orm";
import { callClaude } from "../ai/client";
import { generateEmbeddings, addContextualPrefix } from "../services/embedding";
import { batchUpsertMemories } from "../services/vectorStore";
import { mergeDynamicAttributes } from "../services/memory";

const REFLECTION_PROMPT = `You are a memory synthesis system for Ally, a personal AI companion.

You will receive a list of recent episodic observations about a user. Your job is to identify
durable patterns or insights that should be preserved long-term.

Rules:
- Output only insights that are stable patterns, not one-time events
- Each insight must be ≤ 20 words
- Maximum 3 insights — only output insights where the pattern is clear across multiple observations
- If no clear pattern emerges, output an empty array
- Do not interpret or psychoanalyze — only state what the user clearly demonstrated across multiple events

Return JSON: { "insights": [{ "content": "...", "category": "personal_info|relationships|work|health|interests|goals|emotional_patterns", "importance": 0.7-0.95 }] }`;

const DYNAMIC_PROMOTION_PROMPT = `You are a personality insight system for Ally, a personal AI companion.

You will receive a list of high-importance semantic facts about a user. Your job is to identify
whether any of them represent foundational character traits, behavioral patterns, or values
that should become part of Ally's permanent model of this person.

A dynamic attribute is something about WHO this person IS — not what happened to them.
Examples of valid dynamic attributes:
- "communication_style": "direct and prefers blunt feedback without softening"
- "relationship_with_failure": "treats setbacks analytically, rarely catastrophizes"
- "stress_response": "goes quiet and withdraws before processing in bursts"
- "ambition_pattern": "driven by external validation as much as internal goals"
- "humor_style": "dry and self-deprecating, uses humor to defuse tension"

Rules:
- Only extract attributes with clear evidence across multiple facts
- Use snake_case keys, keep values ≤ 15 words, grounded in facts provided
- Maximum 2 attributes — extremely selective
- Do not invent or extrapolate beyond what the facts show
- If no clear foundational pattern emerges, output an empty object

Return JSON: { "dynamicAttributes": { "key": { "value": "...", "confidence": 0.7-0.95 } } }`;

interface ConsolidationInsight {
  content: string;
  category: string;
  importance: number;
}

async function consolidateForUser(userId: string): Promise<number> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const episodes = await db.query.memoryEpisodes.findMany({
    where: and(
      eq(schema.memoryEpisodes.userId, userId),
      isNull(schema.memoryEpisodes.consolidatedAt),
      lte(schema.memoryEpisodes.createdAt, sevenDaysAgo),
    ),
    columns: {
      id: true,
      content: true,
      category: true,
      entities: true,
      createdAt: true,
    },
    limit: 30,
  });

  if (episodes.length < 3) return 0;

  // Group by shared entities/theme for cluster-based reflection
  const entityGroups = new Map<string, typeof episodes>();

  for (const ep of episodes) {
    const primaryEntity = (ep.entities as string[])[0] ?? ep.category;
    const group = entityGroups.get(primaryEntity) ?? [];
    group.push(ep);
    entityGroups.set(primaryEntity, group);
  }

  let consolidatedCount = 0;

  for (const [, group] of entityGroups) {
    if (group.length < 3) continue;

    const observations = group
      .map((ep) => `- ${ep.content} (${ep.createdAt.toDateString()})`)
      .join("\n");

    try {
      const { text } = await callClaude({
        system: REFLECTION_PROMPT,
        messages: [
          {
            role: "user",
            content: `Recent observations:\n${observations}`,
          },
        ],
        maxTokens: 512,
      });

      let parsed: { insights: ConsolidationInsight[] };
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { insights: [] };
      } catch {
        continue;
      }

      if (!parsed.insights || parsed.insights.length === 0) continue;

      const validInsights = parsed.insights.filter(
        (i): i is ConsolidationInsight =>
          typeof i.content === "string" &&
          typeof i.category === "string" &&
          typeof i.importance === "number",
      );

      if (validInsights.length === 0) continue;

      const episodeIds = group.map((e) => e.id);
      const textsToEmbed = validInsights.map((i) =>
        addContextualPrefix(i.content, i.category as any),
      );
      const embeddings = await generateEmbeddings(textsToEmbed, "document");

      const insertedFacts = await db
        .insert(schema.memoryFacts)
        .values(
          validInsights.map((insight) => ({
            userId,
            content: insight.content,
            category: insight.category as any,
            importance: Math.min(insight.importance, 0.95),
            confidence: 0.9,
            temporal: false,
            entities: [],
            emotion: null,
            consolidatedFrom: episodeIds,
            sourceType: "chat" as const,
            sourceDate: new Date(),
          })),
        )
        .returning({ id: schema.memoryFacts.id });

      await batchUpsertMemories(
        insertedFacts.map((fact, i) => ({
          factId: fact.id,
          embedding: embeddings[i],
          payload: {
            factId: fact.id,
            userId,
            type: "fact" as const,
            category: validInsights[i].category as any,
            importance: validInsights[i].importance,
            emotion: null,
            createdAt: new Date().toISOString(),
            sourceType: "chat" as const,
            content: validInsights[i].content,
          },
        })),
      );

      // Mark source episodes as consolidated
      await db
        .update(schema.memoryEpisodes)
        .set({
          consolidatedAt: new Date(),
          consolidatedIntoFactId: insertedFacts[0]?.id,
        })
        .where(
          and(
            eq(schema.memoryEpisodes.userId, userId),
            sql`id = ANY(${episodeIds})`,
          ),
        );

      consolidatedCount += insertedFacts.length;
      console.log(
        `[consolidation] User ${userId}: created ${insertedFacts.length} facts from ${group.length} episodes`,
      );
    } catch (err) {
      console.error(
        `[consolidation] Reflection failed for user ${userId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (consolidatedCount > 0) {
    await promoteToProfile(userId).catch((err) =>
      console.error(`[consolidation] Profile promotion failed for ${userId}:`, err),
    );
  }

  return consolidatedCount;
}

/**
 * After consolidation creates semantic facts, look at the highest-importance
 * facts for this user and promote recurring patterns to dynamic attributes.
 * Runs after each consolidation cycle.
 */
async function promoteToProfile(userId: string): Promise<void> {
  const highImportanceFacts = await db.query.memoryFacts.findMany({
    where: and(
      eq(schema.memoryFacts.userId, userId),
      isNull(schema.memoryFacts.supersededBy),
      gte(schema.memoryFacts.importance, 0.8),
    ),
    columns: { content: true, category: true, importance: true },
    orderBy: [sql`${schema.memoryFacts.importance} DESC`],
    limit: 15,
  });

  if (highImportanceFacts.length < 3) return;

  const factList = highImportanceFacts
    .map((f) => `- [${f.category}] ${f.content} (importance: ${f.importance.toFixed(2)})`)
    .join("\n");

  const { text } = await callClaude({
    system: DYNAMIC_PROMOTION_PROMPT,
    messages: [{ role: "user", content: `High-importance facts about this user:\n${factList}` }],
    maxTokens: 512,
  });

  let parsed: { dynamicAttributes?: Record<string, { value: string; confidence: number }> };
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    return;
  }

  if (parsed.dynamicAttributes && Object.keys(parsed.dynamicAttributes).length > 0) {
    await mergeDynamicAttributes(userId, parsed.dynamicAttributes);
    console.log(
      `[consolidation] Promoted ${Object.keys(parsed.dynamicAttributes).length} dynamic attributes for user ${userId}`,
    );
  }
}

export async function runConsolidation(): Promise<void> {
  console.log("[consolidation] Starting weekly consolidation run");

  const users = await db
    .selectDistinct({ userId: schema.memoryEpisodes.userId })
    .from(schema.memoryEpisodes)
    .where(isNull(schema.memoryEpisodes.consolidatedAt));

  let totalConsolidated = 0;
  for (const { userId } of users) {
    totalConsolidated += await consolidateForUser(userId).catch((err) => {
      console.error(`[consolidation] Failed for user ${userId}:`, err.message);
      return 0;
    });
  }

  console.log(`[consolidation] Done. Created ${totalConsolidated} new semantic facts.`);
}
