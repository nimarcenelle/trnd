import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Essay results quote students' writing and sit in a database shared with TRND, so they are stored
 * encrypted with a key that only Admitted's deployment holds. AES-256-GCM.
 */
export type Sealed = { sealed: string };

const keyFrom = (base64: string) => {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("ESSAY_ENCRYPTION_KEY must be 32 bytes, base64");
  return key;
};

export function seal(value: unknown, base64Key: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(base64Key), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { sealed: [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".") };
}

export function unseal<T>(value: Sealed, base64Key: string): T {
  const [iv, tag, data] = value.sealed.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(base64Key), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")) as T;
}

export const isSealed = (value: unknown): value is Sealed => typeof (value as Sealed | null)?.sealed === "string";
