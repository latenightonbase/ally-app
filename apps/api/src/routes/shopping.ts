import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { db, schema } from "../db";
import { and, eq } from "drizzle-orm";

export const shoppingRoutes = new Elysia({ prefix: "/api/v1/shopping" })
  .use(authMiddleware)

  // ─── Get all shopping lists ────────────────────────────────────
  .get("/lists", async ({ user, set }) => {
    const [dbUser] = await db
      .select({ familyId: schema.user.familyId })
      .from(schema.user)
      .where(eq(schema.user.id, user.id));

    if (!dbUser?.familyId) {
      set.status = 404;
      return { error: "No family found." };
    }

    const lists = await db
      .select()
      .from(schema.shoppingLists)
      .where(eq(schema.shoppingLists.familyId, dbUser.familyId));

    const listsWithItems = await Promise.all(
      lists.map(async (list) => {
        const items = await db
          .select()
          .from(schema.shoppingListItems)
          .where(eq(schema.shoppingListItems.listId, list.id));
        return { ...list, items };
      }),
    );

    return { lists: listsWithItems };
  })

  // ─── Create a shopping list ────────────────────────────────────
  .post(
    "/lists",
    async ({ body, user, set }) => {
      const [dbUser] = await db
        .select({ familyId: schema.user.familyId })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));

      if (!dbUser?.familyId) {
        set.status = 404;
        return { error: "No family found." };
      }

      const [list] = await db
        .insert(schema.shoppingLists)
        .values({
          familyId: dbUser.familyId,
          name: body.name,
          createdBy: user.id,
        })
        .returning();

      return { list };
    },
    {
      body: t.Object({
        name: t.String(),
      }),
    },
  )

  // ─── Add items to a list ───────────────────────────────────────
  .post(
    "/lists/:listId/items",
    async ({ params, body, user, set }) => {
      // Verify the list belongs to user's family
      const [dbUser] = await db
        .select({ familyId: schema.user.familyId })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));

      if (!dbUser?.familyId) {
        set.status = 404;
        return { error: "No family found." };
      }

      const [list] = await db
        .select()
        .from(schema.shoppingLists)
        .where(
          and(
            eq(schema.shoppingLists.id, params.listId),
            eq(schema.shoppingLists.familyId, dbUser.familyId),
          ),
        );

      if (!list) {
        set.status = 404;
        return { error: "List not found." };
      }

      const items = await db
        .insert(schema.shoppingListItems)
        .values(
          body.items.map((item: any) => ({
            listId: params.listId,
            name: item.name,
            quantity: item.quantity ?? null,
            category: item.category ?? null,
            addedBy: user.id,
          })),
        )
        .returning();

      return { items };
    },
    {
      body: t.Object({
        items: t.Array(
          t.Object({
            name: t.String(),
            quantity: t.Optional(t.String()),
            category: t.Optional(t.String()),
          }),
        ),
      }),
    },
  )

  // ─── Toggle item checked ───────────────────────────────────────
  .patch(
    "/items/:itemId/toggle",
    async ({ params, user, set }) => {
      const [item] = await db
        .select()
        .from(schema.shoppingListItems)
        .where(eq(schema.shoppingListItems.id, params.itemId));

      if (!item) {
        set.status = 404;
        return { error: "Item not found." };
      }

      const [updated] = await db
        .update(schema.shoppingListItems)
        .set({ checked: !item.checked })
        .where(eq(schema.shoppingListItems.id, params.itemId))
        .returning();

      return { item: updated };
    },
  )

  // ─── Delete item ───────────────────────────────────────────────
  .delete("/items/:itemId", async ({ params }) => {
    await db
      .delete(schema.shoppingListItems)
      .where(eq(schema.shoppingListItems.id, params.itemId));

    return { deleted: true };
  })

  // ─── Clear checked items from a list ───────────────────────────
  .delete("/lists/:listId/checked", async ({ params, user, set }) => {
    const [dbUser] = await db
      .select({ familyId: schema.user.familyId })
      .from(schema.user)
      .where(eq(schema.user.id, user.id));

    if (!dbUser?.familyId) {
      set.status = 404;
      return { error: "No family found." };
    }

    await db
      .delete(schema.shoppingListItems)
      .where(
        and(
          eq(schema.shoppingListItems.listId, params.listId),
          eq(schema.shoppingListItems.checked, true),
        ),
      );

    return { cleared: true };
  });
