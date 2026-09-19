import { describe, expect, it } from "vitest";
import { z } from "zod";

import { strictJsonSchema } from "@/lib/ai/json-schema";
import { BusinessBriefSchema, DocumentDigestSchema, GenerationSchema } from "@/lib/ai/schemas";
import { ConceptWriteSchema } from "@/lib/picks/concept";
import { StrategyReadSchema } from "@/lib/research/strategist";

const walk = (node: unknown, fn: (n: Record<string, unknown>) => void) => {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, fn));
  if (!node || typeof node !== "object") return;
  fn(node as Record<string, unknown>);
  Object.values(node as Record<string, unknown>).forEach((v) => walk(v, fn));
};

describe("strictJsonSchema", () => {
  it("requires every property, closes every object and drops length keywords", () => {
    const schema = strictJsonSchema(
      z.object({
        a: z.string().min(3).max(9),
        b: z.array(z.string()).min(1).max(3).default([]),
        c: z.string().nullable(),
        d: z.string().nullish(),
        e: z.enum(["x", "y"]),
        n: z.number().int().min(0).max(5),
        o: z.object({ q: z.string().optional() }),
      }),
    );
    expect(schema.required).toEqual(["a", "b", "c", "d", "e", "n", "o"]);
    expect(schema.additionalProperties).toBe(false);
    expect((schema.properties as Record<string, Record<string, unknown>>).o.required).toEqual(["q"]);
    expect(JSON.stringify(schema)).not.toMatch(/minLength|maxLength|minItems|maxItems|minimum|maximum|default|\$schema/);
    expect((schema.properties as Record<string, unknown>).c).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
    expect((schema.properties as Record<string, unknown>).e).toEqual({ type: "string", enum: ["x", "y"] });
  });

  it("builds every production schema with only strict-mode keywords", () => {
    const allowed = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "anyOf", "description", "$defs", "$ref", "const", "title"]);
    for (const s of [BusinessBriefSchema, GenerationSchema, DocumentDigestSchema, ConceptWriteSchema, StrategyReadSchema]) {
      const json = strictJsonSchema(s);
      walk(json, (n) => {
        if (n.type === "object") {
          expect(n.additionalProperties).toBe(false);
          expect(n.required).toEqual(Object.keys(n.properties as object));
        }
      });
      const keys = new Set<string>();
      walk(json, (n) => {
        // Property names live under `properties`; only schema keywords are checked.
        for (const k of Object.keys(n)) keys.add(k);
      });
      const propertyNames = new Set<string>();
      walk(json, (n) => {
        if (n.properties) Object.keys(n.properties as object).forEach((k) => propertyNames.add(k));
      });
      for (const k of keys) {
        if (!propertyNames.has(k)) expect(allowed, `${k} in schema`).toContain(k);
      }
    }
  });
});
