"use client";

import { useState } from "react";

interface StepData {
  label: string;
  title: string;
  desc: string;
  side: [string, string][];
}

const STEPS: StepData[] = [
  {
    label: "Detect",
    title: "Detect what’s moving",
    desc: "TRND scans search, social, and local demand signals in your category and area, every single day — not once a quarter.",
    side: [
      ["Watching", "Search volume, social conversation, local booking intent"],
      ["Refresh", "Every 24 hours"],
      ["Coverage", "Your category + a configurable radius"],
    ],
  },
  {
    label: "Match",
    title: "Match it to your business",
    desc: "It checks what’s rising against what you actually sell — and what your competitors are missing.",
    side: [
      ["Fit check", "Do you already offer this, or could you"],
      ["Gap check", "Are competitors already advertising it"],
      ["Output", "A ranked list of what’s worth promoting this week"],
    ],
  },
  {
    label: "Position",
    title: "Build the angle",
    desc: "It builds the positioning: the hook, the offer, and the audience most likely to actually convert.",
    side: [
      ["Angle", "The specific claim your ad makes"],
      ["Hook", "The first line that stops the scroll"],
      ["Audience", "Who to target and why"],
    ],
  },
  {
    label: "Launch",
    title: "Launch the campaign",
    desc: "You get finished ad copy, creative direction, and targeting — ready to run today, on the channels you already use.",
    side: [
      ["Output", "Headlines, ad copy, creative brief, targeting"],
      ["Format", "Ready for paid social & search"],
      ["Time to launch", "Same day"],
    ],
  },
  {
    label: "Learn",
    title: "Learn from what happened",
    desc: "Real results — clicks, bookings, cost per result, revenue — feed straight back in, so next week’s campaign is sharper than this week’s.",
    side: [
      ["Pulled back", "CTR, bookings, cost per result, revenue"],
      ["Learning", "Which angle actually worked, and for whom"],
      ["Feeds into", "Next week’s Match + Position step"],
    ],
  },
];

export default function Steps() {
  const [active, setActive] = useState(0);
  const d = STEPS[active];
  return (
    <div className="steps reveal">
      <div className="steps__rail">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            className={`step${i === active ? " active" : ""}`}
            onClick={() => setActive(i)}
            aria-pressed={i === active}
          >
            <span className="step__dot">{i + 1}</span>
            <span className="step__label">{s.label}</span>
          </button>
        ))}
      </div>
      <div className="step-panel">
        <div>
          <span className="step-panel__num">Step {active + 1} of 5</span>
          <h3 className="step-panel__title">{d.title}</h3>
          <p className="step-panel__desc">{d.desc}</p>
        </div>
        <div className="step-panel__side">
          {d.side.map(([k, v]) => (
            <div key={k}>
              <span className="k">{k}</span>
              <p className="v">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
