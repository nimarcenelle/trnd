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
        <div className="pframe__top">
          <span className="pframe__eyebrow">#1 this week · your area</span>
          <span className="pframe__delta">↑48% this week</span>
        </div>
        <div className="pframe__title">Espresso martini flights</div>
        <p className="pframe__why">
          Conversation is climbing near you — built from things you already sell.
        </p>
        <svg className="pframe__chart" viewBox="0 0 320 84" fill="none" aria-hidden="true">
          <path
            id="sparkPath"
            d="M6 66 L44 72 L82 54 L120 60 L158 40 L196 47 L234 22 L268 28"
            stroke="#F0B429"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle id="sparkDot" cx="268" cy="28" r="5" fill="#F0B429" />
        </svg>
        <div className="pframe__row">
          <div className="pframe__score">
            <svg viewBox="0 0 44 44" aria-hidden="true">
              <circle cx="22" cy="22" r="17" stroke="var(--line-strong)" strokeWidth="4" fill="none" />
              <circle
                cx="22"
                cy="22"
                r="17"
                stroke="var(--amber)"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                strokeDasharray="72.6 106.8"
                transform="rotate(-90 22 22)"
              />
            </svg>
            <div>
              <strong>B+</strong>
              <span>solid opportunity</span>
            </div>
          </div>
          <span className="pframe__cta">Build the campaign →</span>
        </div>
        <div className="pframe__foot">5 headlines · 3 primary texts · 3 scripts · targeting — ready to export</div>
      </div>
    </div>
  );
}