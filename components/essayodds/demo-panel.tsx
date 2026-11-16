"use client";

import { DEMO_ACTIVITIES, DEMO_ESSAY, DEMO_HONORS } from "@/lib/essayodds/demo";
import { storeKey } from "@/lib/essayodds/storage";

const set = (name: string, value: unknown) => {
  try {
    localStorage.setItem(storeKey(name), JSON.stringify(value));
  } catch {}
};
const clear = () => {
  for (const name of ["essay-draft", "odds-answers", "lists", "final"])
    try {
      localStorage.removeItem(storeKey(name));
      localStorage.removeItem(`admitted-${name}`);
    } catch {}
};

const SCENES: { title: string; body: string; go: () => string }[] = [
  {
    title: "Odds flow, from scratch",
    body: "Pick schools, paste the sample essay (it's on your clipboard after you click), answer GPA 3.9, SAT 1510, New York. The essay reads in seconds.",
    go: () => {
      clear();
      void navigator.clipboard?.writeText(DEMO_ESSAY).catch(() => {});
      return "/odds";
    },
  },
  {
    title: "Odds flow with a Common App upload",
    body: "Download the sample Common App PDF first, then upload it on the first screen. Everything fills in and the odds come straight up.",
    go: () => {
      clear();
      return "/odds";
    },
  },
  {
    title: "Essay review and rewrite",
    body: "Opens the workspace with the sample essay. Review my draft is instant; on the Rewrite tab, choose Rewrite without them for an instant rewrite.",
    go: () => {
      clear();
      set("essay-draft", { draft: DEMO_ESSAY, prompt: "", limit: "650", answers: {} });
      return "/essay";
    },
  },
  {
    title: "Activities and honors",
    body: "Both lists are filled in. Review my activities, then switch to Honors.",
    go: () => {
      clear();
      set("lists", { activities: DEMO_ACTIVITIES, honors: DEMO_HONORS });
      return "/activities";
    },
  },
  {
    title: "Final Read",
    body: "The sample essay and both lists, ready to check together. Click Run Final Read.",
    go: () => {
      clear();
      set("lists", { activities: DEMO_ACTIVITIES, honors: DEMO_HONORS });
      set("final", [{ id: "demo1", label: "Common App personal statement", prompt: "", limit: 650, text: DEMO_ESSAY }]);
      return "/essay/final";
    },
  },
];

/** One click per scene: sets up the sample student's work in this browser and opens the page. */
export default function DemoPanel() {
  return (
    <ol className="list-none p-0 m-0 flex flex-col gap-3">
      {SCENES.map((s, i) => (
        <li key={s.title} className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-brand tnum">Scene {i + 1}</p>
            <p className="text-[15px] font-semibold mt-0.5">{s.title}</p>
            <p className="text-[13px] text-ink-2 leading-[1.55] mt-1">{s.body}</p>
          </div>
          <button className="btn btn-primary shrink-0" type="button" onClick={() => (window.location.href = s.go())}>
            Open
          </button>
        </li>
      ))}
    </ol>
  );
}
