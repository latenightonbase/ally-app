import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { loadMemoryProfile } from "../services/retrieval";
import { deleteProfile, deleteFact, updateFact, listFacts, restoreFact } from "../services/memory";
import type { MemoryCategory } from "@ally/shared";

const VALID_CATEGORIES = [
  "personal_info",
  "relationships",
  "work",
  "health",
  "interests",
  "goals",
  "emotional_patterns",
] as const;

export const memoryRoutes = new Elysia({ prefix: "/api/v1/memory" })
  .use(authMiddleware)
  .get("/profile", async ({ user }) => {
    const profile = await loadMemoryProfile(user.id);
    return { profile };
  })
  .delete("/profile", async ({ user }) => {
    await deleteProfile(user.id);
    return {
      deleted: true,
      message: "Your memory profile has been permanently deleted.",
    };
  })
  .get(
    "/facts",
    async ({ query, user }) => {
      const category = VALID_CATEGORIES.includes(query.category as any)
        ? (query.category as MemoryCategory)
        : undefined;

      const limit = Math.min(Number(query.limit ?? 20), 100);
      const offset = Number(query.offset ?? 0);
      const includeSuperseeded = query.includeSuperseeded === "true";

      const { facts, total } = await listFacts(user.id, {
        category,
        limit,
        offset,
        includeSuperseeded,
      });

      return {
        facts: facts.map((f) => ({
          id: f.id,
          category: f.category,
          content: f.content,
          sourceDate: f.sourceDate?.toISOString().split("T")[0],
          confidence: f.confidence,
          superseded: f.supersededBy !== null && f.supersededBy !== undefined,
        })),
        total,
        limit,
        offset,
      };
    },
    {
      query: t.Object({
        category: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
        includeSuperseeded: t.Optional(t.String()),
      }),
    },
  )
  .patch(
    "/facts/:factId",
    async ({ params, user, body, set }) => {
      const updated = await updateFact(user.id, params.factId, body.content);
      if (!updated) {
        set.status = 404;
        return { error: { message: "Memory fact not found" } };
      }
      return { updated: true, factId: params.factId };
    },
    {
      params: t.Object({ factId: t.String() }),
      body: t.Object({
        content: t.String({ minLength: 1, maxLength: 1000 }),
      }),
    },
  )
  .delete(
    "/facts/:factId",
    async ({ params, user }) => {
      const deleted = await deleteFact(user.id, params.factId);
      if (!deleted) {
        return { deleted: false, factId: params.factId };
      }
      return { deleted: true, factId: params.factId };
    },
    {
      params: t.Object({
        factId: t.String(),
      }),
    },
  )
  .patch(
    "/facts/:factId/restore",
    async ({ params, user, set }) => {
      const restored = await restoreFact(user.id, params.factId);
      if (!restored) {
        set.status = 404;
        return { error: { message: "Memory fact not found or not superseded" } };
      }
      return { restored: true, factId: params.factId };
    },
    {
      params: t.Object({ factId: t.String() }),
    },
  );
