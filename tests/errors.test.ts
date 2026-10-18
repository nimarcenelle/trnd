import { describe, expect, it } from "vitest";

import { envelope, envelopeUrl } from "@/lib/errors";

describe("sentry envelope", () => {
  it("builds the endpoint from the DSN and a three-line envelope", () => {
    const dsn = "https://abc123@o42.ingest.sentry.io/7";
    expect(envelopeUrl(dsn)).toBe("https://o42.ingest.sentry.io/api/7/envelope/?sentry_key=abc123&sentry_version=7");
    expect(envelopeUrl("nonsense")).toBeNull();
    const lines = envelope(dsn, new Error("boom"), { route: "/app" }, new Date("2026-10-17T00:00:00Z")).split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[1])).toEqual({ type: "event" });
    const event = JSON.parse(lines[2]);
    expect(event.exception.values[0]).toEqual({ type: "Error", value: "boom" });
    expect(event.tags).toEqual({ route: "/app" });
  });
});
