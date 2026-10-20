import { describe, expect, it } from "vitest";

import { avatarTone } from "@/components/app/avatar";
import { cardFileName, hookScale, nextTikTok, onScreenHook, tagList } from "@/lib/preview/next-tiktok";

/** The "Your next TikTok" frame: what the page and the shareable card put on screen. */

describe("onScreenHook", () => {
  it("drops the quotes the plan writes the hook in", () => {
    expect(onScreenHook('"I studied 6 hours and remembered nothing"')).toBe("I studied 6 hours and remembered nothing");
    expect(onScreenHook("“Stop highlighting your notes”")).toBe("Stop highlighting your notes");
    expect(onScreenHook(`  '"Nested quotes"'  `)).toBe("Nested quotes");
  });

  it("keeps quotes inside the line and collapses whitespace", () => {
    expect(onScreenHook('My teacher said "no"  and\nI listened')).toBe('My teacher said "no" and I listened');
    expect(onScreenHook('"')).toBe('"');
  });
});

describe("tagList", () => {
  it("gives every tag one #, drops blanks and repeats in any case", () => {
    expect(tagList(["studytok", "#StudyTok", "##college apps", " ", "#"])).toEqual(["#studytok", "#collegeapps"]);
  });

  it("keeps at most five", () => {
    expect(tagList(["a", "b", "c", "d", "e", "f", "g"])).toEqual(["#a", "#b", "#c", "#d", "#e"]);
  });
});

describe("nextTikTok", () => {
  it("reads the frame from an idea", () => {
    expect(nextTikTok("@marlow.studies", { hook: '"Three ways to stop cramming"', caption: " Which one are you trying first? ", hashtags: ["studytok", "#exams"], sound: "" })).toEqual({
      handle: "marlow.studies",
      hook: "Three ways to stop cramming",
      caption: "Which one are you trying first?",
      hashtags: ["#studytok", "#exams"],
      sound: "Original sound",
    });
  });
});

describe("hookScale", () => {
  it("steps down as the hook gets longer, never growing", () => {
    const sizes = [10, 32, 33, 56, 57, 84, 85, 200].map((n) => hookScale("x".repeat(n)));
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
    expect(sizes[0]).toBeGreaterThan(sizes[sizes.length - 1]);
  });
});

describe("cardFileName", () => {
  it("is safe for any file system", () => {
    expect(cardFileName("@fenn.explains")).toBe("next-tiktok-fenn.explains.png");
    expect(cardFileName("a/b\\c:d")).toBe("next-tiktok-abcd.png");
    expect(cardFileName("@@")).toBe("next-tiktok-creator.png");
  });
});

describe("avatarTone", () => {
  it("is stable per handle and uses the first letter or digit", () => {
    expect(avatarTone("marlow.studies")).toEqual(avatarTone("marlow.studies"));
    expect(avatarTone("_fenn").letter).toBe("F");
    expect(avatarTone("___").letter).toBe("?");
  });
});
