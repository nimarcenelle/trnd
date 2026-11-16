/**
 * Browser storage keys. They were "admitted-…" before the rename to EssayOdds, so reads fall back to the old key and a
 * student's saved draft or answers survive it. Writes only ever use the new key.
 */
export const storeKey = (name: string) => `essayodds-${name}`;

export function readStore(name: string): string | null {
  try {
    return localStorage.getItem(storeKey(name)) ?? localStorage.getItem(`admitted-${name}`);
  } catch {
    return null;
  }
}
