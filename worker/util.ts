import { HTTPException } from "hono/http-exception";

export type Env = {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  SIGNUP_CODE?: string;
  DEMO_MODE?: string;
};

export type User = {
  id: string;
  role: "therapist" | "patient";
  name: string;
  email: string | null;
  therapist_id: string | null;
};

export type AppEnv = { Bindings: Env; Variables: { user: User } };

export function id(): string {
  return crypto.randomUUID();
}

/** Short, unambiguous code for invite links. */
export function inviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function fail(status: 400 | 401 | 403 | 404 | 409, message: string): never {
  throw new HTTPException(status, { message });
}

export function isDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function str(v: unknown, max = 5000): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") fail(400, "Expected text");
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export function painScore(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 10) fail(400, "Pain must be 0 to 10");
  return n;
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
