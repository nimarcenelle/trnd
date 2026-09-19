import { z } from "zod";

/**
 * The strict JSON Schema the model is held to, built from the Zod schema the
 * app validates against, so there is one shape per call and never a
 * hand-copied second one.
 *
 * OpenAI's structured output guarantees the reply matches the schema, on two
 * conditions it enforces at request time: every property is required and no
 * object accepts extra keys. A field the Zod schema defaults or makes
 * optional is required here (the model returns an empty list or string
 * where it has nothing), and a field the Zod schema makes nullable is
 * nullable here. Length and range keywords (minLength, minItems, minimum,
 * ...) are dropped: the request would be refused for them, and the prompt
 * already says how many of a thing to return; the Zod parse enforces the
 * count on the reply.
 */

type Node = Record<string, unknown>;

const DROP = new Set(["minLength", "maxLength", "minItems", "maxItems", "pattern", "format", "default", "$schema", "id", "uniqueItems", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]);

function strict(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strict);
  if (!node || typeof node !== "object") return node;
  const out: Node = {};
  for (const [k, v] of Object.entries(node as Node)) {
    if (DROP.has(k)) continue;
    out[k] = k === "properties" || k === "$defs" || k === "definitions" ? mapValues(v as Node, strict) : strict(v);
  }
  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    out.required = Object.keys(out.properties as Record<string, Node>);
    out.additionalProperties = false;
  }
  return out;
}

function mapValues(obj: Node, fn: (v: unknown) => unknown): Node {
  const out: Node = {};
  for (const [k, v] of Object.entries(obj)) out[k] = fn(v);
  return out;
}

/** Strict JSON Schema for `schema`, as the OpenAI structured-output format wants it. */
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { io: "input", unrepresentable: "any", target: "draft-2020-12" });
  return strict(raw) as Record<string, unknown>;
}
