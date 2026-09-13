/**
 * The one layout every TRND email uses. Email clients ignore stylesheets and
 * fight with divs, so this is a table, 600px wide, with every style inline
 * and no images. Callers hand over already-written copy; the layout only
 * frames it. Every interpolated string passes through `esc()`.
 */

export interface EmailCta {
  label: string;
  url: string;
}

export interface EmailLayout {
  /** The hidden line an inbox shows under the subject. */
  preheader: string;
  title: string;
  /** One sentence under the title. */
  intro: string;
  /** Already-rendered, already-escaped HTML for the middle of the card. */
  body: string;
  cta: EmailCta | null;
  /** One quiet line under the button, when there is something to say. */
  footnote?: string | null;
}

export const FONT = `"Instrument Sans", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
export const MONO = `"IBM Plex Mono", Menlo, monospace`;

export const INK = "#23201a";
export const SOFT = "#5d564a";
export const FAINT = "#6f6759";
export const LINE = "#e6e1d4";
export const PAPER = "#f6f4ee";
export const TEAL = "#1ea7ae";
export const AMBER = "#d99a12";
export const AMBER_INK = "#2b1b08";

/** Escape a string for an HTML text node or a double-quoted attribute. */
export function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export function renderEmail(opts: EmailLayout): string {
  const { preheader, title, intro, body, cta } = opts;
  const footnote = opts.footnote ?? null;

  const button = cta
    ? `
            <tr>
              <td style="padding:22px 0 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background:${AMBER};border-radius:999px;">
                      <a href="${esc(cta.url)}" style="display:inline-block;padding:12px 20px;font-family:${FONT};font-size:14px;font-weight:600;line-height:1;color:${AMBER_INK};text-decoration:none;border-radius:999px;">${esc(cta.label)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
    : "";

  const note = footnote
    ? `
            <tr>
              <td style="padding:16px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${FAINT};">${esc(footnote)}</td>
            </tr>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${PAPER};opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
        <tr>
          <td style="padding:0 4px 16px;font-family:${FONT};">
            <span style="display:inline-block;width:6px;height:6px;border-radius:3px;background:${TEAL};vertical-align:middle;margin:0 8px 2px 0;"></span><span style="font-size:13px;font-weight:700;letter-spacing:0.18em;color:${INK};vertical-align:middle;">TRND</span>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border:1px solid ${LINE};border-radius:14px;padding:28px 28px 26px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:${FONT};font-size:22px;font-weight:700;line-height:1.25;letter-spacing:-0.02em;color:${INK};">${esc(title)}</td>
              </tr>
              <tr>
                <td style="padding:10px 0 0;font-family:${FONT};font-size:15px;line-height:1.5;color:${SOFT};">${esc(intro)}</td>
              </tr>
              <tr>
                <td style="padding:20px 0 0;font-family:${FONT};font-size:14px;line-height:1.5;color:${INK};">${body}</td>
              </tr>${button}${note}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 4px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${FAINT};">
            TRND &middot; <a href="https://usetrnd.com" style="color:${FAINT};text-decoration:none;">usetrnd.com</a><br>
            You get this because you have a TRND account.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** A small eyebrow above a section of the body; the first one sits flush. */
export function eyebrow(text: string, opts: { first?: boolean } = {}): string {
  return `<p style="margin:${opts.first ? "0 0 8px" : "18px 0 6px"};font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${FAINT};">${esc(text)}</p>`;
}

/** One body paragraph. */
export function paragraph(text: string, color: string = SOFT): string {
  return `<p style="margin:0 0 10px;font-family:${FONT};font-size:14px;line-height:1.6;color:${color};">${esc(text)}</p>`;
}

/** A number or a grade, set in the mono face. */
export function mono(text: string, color: string = INK): string {
  return `<span style="font-family:${MONO};font-size:12.5px;color:${color};white-space:nowrap;">${esc(text)}</span>`;
}
