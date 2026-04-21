import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { and, eq } from "drizzle-orm";
import { createTestApp, authedRequest, json } from "../../helpers/app";
import { signTestToken, TEST_USER } from "../../helpers/jwt";
import { truncateAll, seedUsers } from "../../helpers/seed";
import { db, schema } from "../../../db";

async function seedFamilyForTestUser(): Promise<{
  familyId: string;
  memberIds: string[];
}> {
  const [family] = await db
    .insert(schema.families)
    .values({
      name: "Test Family",
      createdBy: TEST_USER.id,
      timezone: "America/New_York",
    })
    .returning();

  await db
    .update(schema.user)
    .set({ familyId: family.id, familyRole: "admin" })
    .where(eq(schema.user.id, TEST_USER.id));

  const members = await db
    .insert(schema.familyMembers)
    .values([
      { familyId: family.id, name: "Dad", role: "parent" },
      { familyId: family.id, name: "Jake", role: "child", age: 10 },
    ])
    .returning();

  return {
    familyId: family.id,
    memberIds: members.map((m) => m.id),
  };
}

describe("Reminder Routes", () => {
  let app: ReturnType<typeof createTestApp>;
  let token: string;

  beforeAll(async () => {
    app = createTestApp();
    token = await signTestToken({ sub: TEST_USER.id, tier: TEST_USER.tier });
  });

  beforeEach(async () => {
    await truncateAll();
    await seedUsers();
  });

  describe("POST /api/v1/reminders", () => {
    it("rejects reminders with invalid remindAt", async () => {
      await seedFamilyForTestUser();
      const res = await authedRequest(app, "/api/v1/reminders", token, {
        method: "POST",
        body: {
          title: "Test",
          remindAt: "not-a-date",
        },
      });
      expect(res.status).toBe(400);
    });

    it("creates a reminder with multiple targetMemberIds", async () => {
      const { familyId, memberIds } = await seedFamilyForTestUser();
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const res = await authedRequest(app, "/api/v1/reminders", token, {
        method: "POST",
        body: {
          title: "Buy cheese",
          remindAt: future,
          targetMemberIds: memberIds,
        },
      });
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.reminder).toBeDefined();
      expect(body.reminder.title).toBe("Buy cheese");
      expect(body.reminder.targetMemberIds).toEqual(memberIds);
      expect(body.reminder.familyId).toBe(familyId);
      expect(body.reminder.source).toBe("user");
    });

    it("rejects invalid targetMemberIds", async () => {
      await seedFamilyForTestUser();
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const res = await authedRequest(app, "/api/v1/reminders", token, {
        method: "POST",
        body: {
          title: "Ghost reminder",
          remindAt: future,
          targetMemberIds: ["00000000-0000-0000-0000-000000000000"],
        },
      });
      expect(res.status).toBe(400);
    });

    it("accepts a single targetMemberIds as string", async () => {
      const { memberIds } = await seedFamilyForTestUser();
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const res = await authedRequest(app, "/api/v1/reminders", token, {
        method: "POST",
        body: {
          title: "Check mail",
          remindAt: future,
          targetMemberIds: memberIds[0],
        },
      });
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.reminder.targetMemberIds).toEqual([memberIds[0]]);
    });
  });

  describe("GET /api/v1/reminders", () => {
    it("returns the user's reminders", async () => {
      const { memberIds } = await seedFamilyForTestUser();
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      await authedRequest(app, "/api/v1/reminders", token, {
        method: "POST",
        body: {
          title: "A",
          remindAt: future,
          targetMemberIds: [memberIds[0]],
        },
      });
      await authedRequest(app, "/api/v1/reminders", token, {
        method: "POST",
        body: {
          title: "B",
          remindAt: future,
          targetMemberIds: memberIds,
        },
      });

      const res = await authedRequest(app, "/api/v1/reminders", token);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.reminders.length).toBe(2);
      const b = body.reminders.find((r: any) => r.title === "B");
      expect(b.targetMemberIds).toEqual(memberIds);
    });
  });

  describe("DELETE /api/v1/reminders/:id", () => {
    it("removes a reminder the user owns", async () => {
      const { memberIds } = await seedFamilyForTestUser();
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const createRes = await authedRequest(app, "/api/v1/reminders", token, {
        method: "POST",
        body: {
          title: "Temp",
          remindAt: future,
          targetMemberIds: [memberIds[0]],
        },
      });
      const { reminder } = await json(createRes);

      const delRes = await authedRequest(
        app,
        `/api/v1/reminders/${reminder.id}`,
        token,
        { method: "DELETE" },
      );
      expect(delRes.status).toBe(200);

      const still = await db.query.reminders.findFirst({
        where: and(eq(schema.reminders.id, reminder.id)),
      });
      expect(still).toBeUndefined();
    });
  });
});
