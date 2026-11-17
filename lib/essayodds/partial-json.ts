/**
 * Reads JSON that is still being written: closes whatever string, array or object is open and parses what is there, so
 * a reply can be shown while it streams. Returns null until there is enough to read.
 */
export function parsePartial<T>(text: string): T | null {
  let s = text.trim();
  for (let tries = 0; tries < 60 && s.length > 1; tries++) {
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    for (const ch of s) {
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{" || ch === "[") stack.push(ch);
      else if (ch === "}" || ch === "]") stack.pop();
    }
    let closed = s;
    if (inString) closed += escaped ? '\\"' : '"';
    closed = closed.replace(/[,:\s]+$/, "");
    closed += stack.reverse().map((c) => (c === "{" ? "}" : "]")).join("");
    try {
      return JSON.parse(closed) as T;
    } catch {
      // A key with no value yet, or half a literal: drop the last piece and try again.
      const cut = Math.max(s.lastIndexOf(","), s.lastIndexOf("{"), s.lastIndexOf("["));
      if (cut <= 0) return null;
      s = s.slice(0, s[cut] === "," ? cut : cut + 1);
    }
  }
  return null;
}
