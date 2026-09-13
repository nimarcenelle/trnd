import { afterEach, describe, expect, it, vi } from "vitest";

// The flags are read once at module load, so each case re-imports lib/env
// with the variable set the way that case needs it.
const loadFlags = async (value: string | undefined) => {
  if (value === undefined) delete process.env.PROSPECTOR_ENABLED;
  else process.env.PROSPECTOR_ENABLED = value;
  vi.resetModules();
  return import("../lib/env");
};

afterEach(() => {
  delete process.env.PROSPECTOR_ENABLED;
  vi.resetModules();
});

describe("isProspectorEnabled", () => {
  it("is off when PROSPECTOR_ENABLED is unset", async () => {
    const { isProspectorEnabled } = await loadFlags(undefined);
    expect(isProspectorEnabled).toBe(false);
  });

  it("is off for an empty value, which is what an env import creates", async () => {
    const { isProspectorEnabled } = await loadFlags("");
    expect(isProspectorEnabled).toBe(false);
  });

  it("stays off for truthy-looking values that are not exactly 1", async () => {
    for (const value of ["true", "yes", "0", "on"]) {
      const { isProspectorEnabled } = await loadFlags(value);
      expect(isProspectorEnabled, value).toBe(false);
    }
  });

  it("turns on only for exactly 1", async () => {
    const { isProspectorEnabled } = await loadFlags("1");
    expect(isProspectorEnabled).toBe(true);
  });
});
