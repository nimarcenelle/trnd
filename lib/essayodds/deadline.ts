/** Most regular-decision deadlines fall on January 1. Days until the next one, counted in New York. */
export function daysToRegularDecision(now = new Date()): number {
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const next = new Date(ny.getFullYear() + (ny.getMonth() === 0 && ny.getDate() === 1 ? 0 : 1), 0, 1);
  return Math.max(0, Math.ceil((next.getTime() - new Date(ny.getFullYear(), ny.getMonth(), ny.getDate()).getTime()) / 86_400_000));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Days until a deadline written like "Jan 2", counted in New York, or null if it can't be read. */
export function daysUntil(monthDay: string | null | undefined, now = new Date()): number | null {
  const m = /^([A-Z][a-z]{2})\w*\s+(\d{1,2})$/.exec(monthDay?.trim() ?? "");
  const month = m ? MONTHS.indexOf(m[1]) : -1;
  if (!m || month < 0) return null;
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const today = new Date(ny.getFullYear(), ny.getMonth(), ny.getDate());
  let due = new Date(ny.getFullYear(), month, Number(m[2]));
  if (due < today) due = new Date(ny.getFullYear() + 1, month, Number(m[2]));
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}
