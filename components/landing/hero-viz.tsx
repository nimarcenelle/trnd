export default function HeroViz() {
  return (
    <div className="signal-viz">
      <svg
        viewBox="0 0 460 380"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="A rising demand signal turning into a finished ad campaign card"
      >
        <text x="8" y="24" className="sv-label sv-faint" fill="#8F6B44">
          DEMAND SIGNAL — 30D
        </text>
        <path
          id="sparkPath"
          d="M8 210 L46 224 L84 190 L122 200 L160 140 L198 158 L236 96 L266 108"
          fill="none"
          stroke="#D99A12"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle id="sparkDot" cx="266" cy="108" r="6" fill="#D99A12" />
        <text x="230" y="86" className="sv-chip sv-mint" fill="#1EA7AE">
          +34% this week
        </text>
        <text x="8" y="252" className="sv-chip sv-faint" fill="#8F6B44">
          Opportunity score
        </text>
        <text x="8" y="272" className="sv-headline sv-ink" fontSize="26" fill="#33200F" fontWeight="700">
          8.7 / 10
        </text>
        <path
          id="connectFlow"
          d="M280 108 C 320 108, 330 108, 352 108"
          stroke="#D99A12"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <g id="adCard">
          <rect className="sv-card" x="300" y="20" width="152" height="220" rx="16" fill="#FFFFFF" stroke="#EFE0C0" strokeWidth="1.5" />
          <circle className="sv-amber-fill" cx="322" cy="42" r="7" fill="#D99A12" />
          <rect x="336" y="37" width="60" height="9" rx="4" fill="#3A2205" opacity="0.55" />
          <text x="426" y="42" textAnchor="end" className="sv-label" fill="#3A2205" opacity="0.45">
            AD
          </text>
          <rect x="316" y="60" width="120" height="80" rx="10" fill="#3A2205" opacity="0.12" />
          <path
            d="M330 118 L352 96 L368 108 L392 82 L410 98"
            stroke="#3A2205"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.55"
          />
          <rect x="316" y="152" width="112" height="10" rx="3" fill="#22160A" opacity="0.85" />
          <rect x="316" y="168" width="80" height="8" rx="3" fill="#22160A" opacity="0.4" />
          <rect className="sv-amber-fill" x="316" y="196" width="116" height="30" rx="15" fill="#D99A12" />
          <text x="374" y="215" textAnchor="middle" className="sv-chip" fill="#3A2205" fontSize="10.5">
            Book now →
          </text>
        </g>
      </svg>
    </div>
  );
}
