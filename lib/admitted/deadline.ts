/** Most regular-decision deadlines fall on January 1. Days until the next one, counted in New York. */
export function daysToRegularDecision(now = new Date()): number {
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const next = new Date(ny.getFullYear() + (ny.getMonth() === 0 && ny.getDate() === 1 ? 0 : 1), 0, 1);
  return Math.max(0, Math.ceil((next.getTime() - new Date(ny.getFullYear(), ny.getMonth(), ny.getDate()).getTime()) / 86_400_000));
}
