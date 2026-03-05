import { Elysia } from "elysia";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { isClaudeReachable } from "../ai/client";

const startedAt = Date.now();

export const healthRoutes = new Elysia({ prefix: "/api/v1" }).get(
  "/health",
  async () => {
    let dbOk = false;
    try {
      await db.execute(sql`SELECT 1`);
      dbOk = true;
    } catch {}

    return {
      status: dbOk ? "ok" : "degraded",
      version: "0.1.0",
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      services: {
        database: dbOk ? "connected" : "unreachable",
      },
    };
  },
);
