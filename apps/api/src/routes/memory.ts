import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { loadMemoryProfile } from "../services/retrieval";
import { deleteProfile, deleteFact, listFacts } from "../services/memory";
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

      const { facts, total } = await listFacts(user.id, {
        category,
        limit,
        offset,
      });

      return {
        facts: facts.map((f) => ({
          id: f.id,
          category: f.category,
          content: f.content,
          sourceDate: f.sourceDate?.toISOString().split("T")[0],
          confidence: f.confidence,
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
  );
