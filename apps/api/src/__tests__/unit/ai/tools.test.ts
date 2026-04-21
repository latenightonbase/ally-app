import { describe, expect, it } from "bun:test";
import { getCustomTools } from "../../../ai/tools";

describe("AI tool definitions", () => {
  const tools = getCustomTools();
  const byName = new Map(tools.map((t) => [t.name, t]));

  it("exposes the four read-only list tools", () => {
    expect(byName.has("list_family_reminders")).toBe(true);
    expect(byName.has("list_family_tasks")).toBe(true);
    expect(byName.has("list_shopping_items")).toBe(true);
    expect(byName.has("list_family_events")).toBe(true);
  });

  it("list tools have no required input fields (safe to call blindly)", () => {
    const listNames = [
      "list_family_reminders",
      "list_family_tasks",
      "list_shopping_items",
      "list_family_events",
    ];
    for (const name of listNames) {
      const tool = byName.get(name);
      expect(tool).toBeDefined();
      const schema = tool!.input_schema as unknown as {
        required?: string[];
        type: string;
      };
      expect(schema.type).toBe("object");
      expect(schema.required ?? []).toEqual([]);
    }
  });

  it("set_family_reminder accepts multi-target via targetMembers array", () => {
    const tool = byName.get("set_family_reminder");
    expect(tool).toBeDefined();
    const schema = tool!.input_schema as unknown as {
      properties: Record<string, { type: string; items?: { type: string } }>;
      required: string[];
    };
    expect(schema.properties.targetMembers).toBeDefined();
    expect(schema.properties.targetMembers.type).toBe("array");
    expect(schema.properties.targetMembers.items?.type).toBe("string");
    expect(schema.required).not.toContain("targetMember");
    expect(schema.required).toContain("topic");
    expect(schema.required).toContain("when");
  });

  it("assign_task accepts assignedTo as string array", () => {
    const tool = byName.get("assign_task");
    expect(tool).toBeDefined();
    const schema = tool!.input_schema as unknown as {
      properties: Record<string, { type: string; items?: { type: string } }>;
    };
    expect(schema.properties.assignedTo.type).toBe("array");
    expect(schema.properties.assignedTo.items?.type).toBe("string");
  });
});
