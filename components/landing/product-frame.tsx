/**
 * The hero visual: the actual product, framed as a browser window — this
 * week's recommendation, scored and ready to build. Same data shapes the
 * real /app screen renders, so the landing promises exactly what ships.
 */
export default function ProductFrame() {
  return (
    <div
      className="pframe"
      role="img"
      aria-label="The TRND dashboard showing this week's top recommendation, its score, and a Build the campaign button"
    >
      <div className="pframe__bar">
        <i />
        <i />
        <i />
        <span>usetrnd.com/app — this week</span>
      </div>
      <div className="pframe__body">
        <div className="pframe__main">
          <div className="pframe__top">
            <span className="pframe__eyebrow">#1 this week · your area</span>
          </div>
          <div className="pframe__title">Espresso martini flights</div>
          <p className="pframe__why">
            Conversation is climbing near you — built from things you already sell.
          </p>
          <div className="pframe__row">
            <div className="pframe__score">
              <svg viewBox="0 0 44 44" aria-hidden="true">
                <circle cx="22" cy="22" r="17" stroke="var(--bg-2)" strokeWidth="4" fill="none" />
                <circle
                  cx="22"
                  cy="22"
                  r="17"
                  stroke="var(--mint)"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray="81.2 106.8"
                  transform="rotate(-90 22 22)"
                />
              </svg>
              <div>
                <strong>A-</strong>
                <span>strong opportunity</span>
              </div>
            </div>
            <span className="pframe__cta">Build the campaign →</span>
          </div>
        </div>
        <div className="pframe__side">
          <span className="pframe__delta">↑48% this week</span>
          <svg className="pframe__chart" viewBox="0 0 320 84" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1EA7AE" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#1EA7AE" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M6 66 C19 68, 31 71, 44 72 C57 73, 69 60, 82 54 C95 48, 107 59, 120 60 C133 61, 145 46, 158 40 C171 34, 183 45, 196 47 C209 49, 221 30, 234 22 C245 15, 257 26, 268 28 L268 84 L6 84 Z"
              fill="url(#sparkFill)"
            />
            <path
              id="sparkPath"
              d="M6 66 C19 68, 31 71, 44 72 C57 73, 69 60, 82 54 C95 48, 107 59, 120 60 C133 61, 145 46, 158 40 C171 34, 183 45, 196 47 C209 49, 221 30, 234 22 C245 15, 257 26, 268 28"
              stroke="#F0B429"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="268" cy="28" r="10" fill="#F0B429" opacity="0.16" />
            <circle id="sparkDot" cx="268" cy="28" r="5" fill="#F0B429" />
          </svg>
          <div className="pframe__foot">5 headlines · 3 primary texts · 3 scripts · targeting — ready to export</div>
        </div>
      </div>
    </div>
  );
}