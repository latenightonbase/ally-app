import { FalkorDB } from "falkordb";
import type { EntityType } from "@ally/shared";

const GRAPH_NAME = "ally";

// Lazy singleton — FalkorDB.connect() is async so we cache the promise
let _dbPromise: Promise<FalkorDB> | null = null;

function getDB(): Promise<FalkorDB> {
  if (!_dbPromise) {
    const url = process.env.FALKORDB_URL;
    if (!url) throw new Error("FALKORDB_URL env var is required");

    const parsed = new URL(url);
    const tls = parsed.protocol === "rediss:";
    const port = parsed.port ? parseInt(parsed.port, 10) : tls ? 6380 : 6379;
    const password = parsed.password || undefined;
    const username = parsed.username || undefined;

    _dbPromise = FalkorDB.connect({
      socket: { host: parsed.hostname, port, tls },
      ...(password ? { password } : {}),
      ...(username ? { username } : {}),
    });
  }
  return _dbPromise;
}

async function getGraph() {
  const db = await getDB();
  return db.selectGraph(GRAPH_NAME);
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

export interface UpsertEntityInput {
  userId: string;
  name: string;
  type: EntityType;
  description?: string | null;
  aliases?: string[];
  factId?: string;
  episodeId?: string;
}

/**
 * Resolve coreference: find an existing entity whose normalizedName is a
 * substring of the new name (or vice versa), or whose aliases contain the
 * new name. Prevents "Sarah" and "Sarah M." from becoming separate graph nodes.
 * Returns the existing entity's id string, or null if no match.
 */
/**
 * Resolve an entity id by exact canonical id or coreference. Used both
 * internally during upsert and externally (storeEntities cross-batch lookup).
 */
export async function resolveEntityIdByName(
  userId: string,
  name: string,
): Promise<string | null> {
  const normalizedName = normalizeName(name);
  const canonicalId = `${userId}:${normalizedName}`;
  const graph = await getGraph();

  const exact = await graph.query(
    `MATCH (e:Entity {id: $id}) RETURN e.id AS id`,
    { params: { id: canonicalId } },
  ).catch(() => null);
  if ((exact?.data?.length ?? 0) > 0) return canonicalId;

  return findCoreferentEntity(userId, normalizedName);
}

async function findCoreferentEntity(
  userId: string,
  normalizedName: string,
): Promise<string | null> {
  const graph = await getGraph();
  const result = await graph.query(
    `MATCH (e:Entity {userId: $userId})
     WHERE e.normalizedName CONTAINS $normalizedName
        OR $normalizedName CONTAINS e.normalizedName
        OR $normalizedName IN e.aliases
     RETURN e.id AS id
     LIMIT 3`,
    { params: { userId, normalizedName } },
  ).catch(() => null);

  if (!result?.data?.length) return null;

  const rows = result.data as { id: string }[];
  return rows[0]?.id ?? null;
}

/**
 * Upsert an entity node. Checks for coreference (substring name match or alias
 * overlap) before creating — merges with the existing node if found.
 * Returns the entity id.
 */
export async function upsertEntity(input: UpsertEntityInput): Promise<string> {
  const graph = await getGraph();
  const normalizedName = normalizeName(input.name);
  const canonicalId = `${input.userId}:${normalizedName}`;

  // First, exact-id lookup (fast path)
  const exactMatch = await graph.query(
    `MATCH (e:Entity {id: $id}) RETURN e.id AS id`,
    { params: { id: canonicalId } },
  );

  const hasExactMatch = (exactMatch.data?.length ?? 0) > 0;

  // Fall back to coreference resolution when no exact match
  const resolvedId = hasExactMatch
    ? canonicalId
    : (await findCoreferentEntity(input.userId, normalizedName)) ?? canonicalId;

  const isNew = resolvedId === canonicalId && !hasExactMatch;

  if (!isNew) {
    // Merge into the resolved entity: append ids and register new alias if needed
    const updates: string[] = [];
    if (input.description) updates.push(`e.description = $description`);
    if (input.factId) updates.push(`e.factIds = e.factIds + [$factId]`);
    if (input.episodeId) updates.push(`e.episodeIds = e.episodeIds + [$episodeId]`);
    // Register the new name variant as an alias when it differs from the resolved node's name
    updates.push(`e.aliases = e.aliases + [$alias]`);

    if (updates.length > 0) {
      await graph.query(
        `MATCH (e:Entity {id: $id}) SET ${updates.join(", ")}`,
        {
          params: {
            id: resolvedId,
            description: input.description ?? null,
            factId: input.factId ?? null,
            episodeId: input.episodeId ?? null,
            alias: normalizedName,
          },
        },
      );
    }
  } else {
    await graph.query(
      `CREATE (:Entity {
        id: $id,
        userId: $userId,
        type: $type,
        name: $name,
        normalizedName: $normalizedName,
        description: $description,
        aliases: $aliases,
        factIds: $factIds,
        episodeIds: $episodeIds,
        createdAt: $createdAt
      })`,
      {
        params: {
          id: canonicalId,
          userId: input.userId,
          type: input.type,
          name: input.name,
          normalizedName,
          description: input.description ?? null,
          aliases: input.aliases ?? [],
          factIds: input.factId ? [input.factId] : [],
          episodeIds: input.episodeId ? [input.episodeId] : [],
          createdAt: new Date().toISOString(),
        },
      },
    );
  }

  return resolvedId;
}

export interface CreateEdgeInput {
  userId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationType: string;
  weight?: number;
  context?: string;
}

export async function createEdge(input: CreateEdgeInput): Promise<void> {
  const graph = await getGraph();
  await graph.query(
    `MATCH (a:Entity {id: $sourceId}), (b:Entity {id: $targetId})
     MERGE (a)-[r:RELATED_TO {relationType: $relationType, userId: $userId}]->(b)
     SET r.weight = $weight, r.context = $context, r.updatedAt = $updatedAt`,
    {
      params: {
        sourceId: input.sourceEntityId,
        targetId: input.targetEntityId,
        relationType: input.relationType,
        userId: input.userId,
        weight: input.weight ?? 1.0,
        context: input.context ?? null,
        updatedAt: new Date().toISOString(),
      },
    },
  );
}

/**
 * Get all factIds and episodeIds linked to entities matching the given names.
 * Traverses up to 2 relationship hops (entity itself + neighbors + their neighbors)
 * so e.g. "Tell me about Sarah's work situation" also surfaces facts linked to
 * Sarah's employer and the employer's related entities.
 */
export async function getEntityLinkedIds(
  userId: string,
  entityNames: string[],
): Promise<{ factIds: string[]; episodeIds: string[] }> {
  if (entityNames.length === 0) return { factIds: [], episodeIds: [] };

  const graph = await getGraph();
  const normalizedNames = entityNames.map(normalizeName);

  // *0..2 traversal: 0 = entity itself, 1 = direct neighbors, 2 = neighbors of neighbors
  const result = await graph.query(
    `MATCH (a:Entity {userId: $userId})-[:RELATED_TO*0..2]->(b:Entity)
     WHERE a.normalizedName IN $names
     RETURN b.factIds AS factIds, b.episodeIds AS episodeIds`,
    { params: { userId, names: normalizedNames } },
  );

  const factIds: string[] = [];
  const episodeIds: string[] = [];

  if (result.data) {
    for (const row of result.data as { factIds: string[]; episodeIds: string[] }[]) {
      if (row.factIds) factIds.push(...row.factIds.filter(Boolean));
      if (row.episodeIds) episodeIds.push(...row.episodeIds.filter(Boolean));
    }
  }

  return {
    factIds: [...new Set(factIds)],
    episodeIds: [...new Set(episodeIds)],
  };
}

/**
 * Get related entity names for a given entity, one hop away.
 * Used for context enrichment.
 */
export async function getRelatedEntities(
  userId: string,
  entityName: string,
): Promise<{ name: string; relationType: string }[]> {
  const graph = await getGraph();
  const normalizedName = normalizeName(entityName);

  const result = await graph.query(
    `MATCH (a:Entity {userId: $userId, normalizedName: $normalizedName})-[r:RELATED_TO]->(b:Entity)
     RETURN b.name AS name, r.relationType AS relationType
     LIMIT 10`,
    { params: { userId, normalizedName } },
  );

  if (!result.data) return [];
  return (result.data as { name: string; relationType: string }[]).filter((r) => r.name);
}

/**
 * Extract entity names from a text string using simple heuristics.
 * Used for entity-triggered retrieval when we have a conversation query
 * but haven't run the full extraction pipeline.
 */
export function extractEntityNamesFromText(text: string): string[] {
  const capitalizedWords = text.match(/\b[A-Z][a-z]{1,}\b/g) ?? [];
  const stopWords = new Set([
    "I", "The", "A", "An", "In", "On", "At", "For", "To", "Of", "And", "But",
    "Or", "So", "If", "My", "Your", "His", "Her", "We", "They", "It", "This",
    "That", "What", "How", "When", "Where", "Why", "Who", "Which", "Do", "Did",
    "Is", "Are", "Was", "Were", "Have", "Has", "Had", "Can", "Could", "Would",
    "Should", "Will", "May", "Might",
  ]);

  return [...new Set(capitalizedWords.filter((w) => !stopWords.has(w)))].slice(0, 5);
}

export async function deleteUserGraph(userId: string): Promise<void> {
  const graph = await getGraph();
  await graph.query(
    `MATCH (e:Entity {userId: $userId}) DETACH DELETE e`,
    { params: { userId } },
  ).catch(() => {});
}
