import { describe, it, expect, beforeAll } from "bun:test";
import { createTestApp, request, json } from "../../helpers/app";

describe("GET /api/v1/health", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    app = createTestApp();
  });

  it("returns 200 with status ok", async () => {
    const res = await request(app, "/api/v1/health");
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.status).toBe("ok");
    expect(body.version).toBeDefined();
    expect(typeof body.uptime).toBe("number");
  });

  it("includes database service status", async () => {
    const res = await request(app, "/api/v1/health");
    const body = await json(res);
    expect(body.services).toBeDefined();
    expect(body.services.database).toBe("connected");
  });

  it("does not require authentication", async () => {
    const res = await request(app, "/api/v1/health");
    expect(res.status).toBe(200);
  });
});
