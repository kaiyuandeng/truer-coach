import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv, Env, User } from "./util";
import { fail } from "./util";

const SESSION_COOKIE = "ptc_session";
const SESSION_DAYS = 90;
// Workers caps PBKDF2 at 100k iterations.
const PBKDF2_ITERATIONS = 100_000;

const toHex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string) => new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));

export async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return { hash: toHex(bits), salt: toHex(salt) };
}

export async function verifyPassword(password: string, hash: string, salt: string) {
  const attempt = await hashPassword(password, salt);
  // Constant-time comparison.
  let diff = attempt.hash.length ^ hash.length;
  for (let i = 0; i < hash.length; i++) diff |= attempt.hash.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export async function startSession(c: Context<AppEnv>, userId: string) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await c.env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expires.toISOString())
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    expires,
  });
}

export async function endSession(c: Context<AppEnv>) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function currentUser(c: Context<AppEnv>): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return c.env.DB.prepare(
    `SELECT u.id, u.role, u.name, u.email, u.therapist_id FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ? AND u.archived = 0`,
  )
    .bind(token, new Date().toISOString())
    .first<User>();
}

export async function requireUser(c: Context<AppEnv>, next: Next) {
  const user = await currentUser(c);
  if (!user) fail(401, "Please sign in");
  c.set("user", user);
  await next();
}

export function requireTherapist(c: Context<AppEnv>) {
  const user = c.get("user");
  if (user.role !== "therapist") fail(403, "Therapists only");
  return user;
}

/**
 * Resolves which patient a request is about and checks access. Patients can only see themselves;
 * therapists can see their own patients.
 */
export async function patientFor(c: Context<AppEnv>, requested?: string | null) {
  const user = c.get("user");
  const patientId = user.role === "patient" ? user.id : requested;
  if (!patientId) fail(400, "Missing patient");
  const patient = await c.env.DB.prepare(
    "SELECT id, name, therapist_id FROM users WHERE id = ? AND role = 'patient'",
  )
    .bind(patientId)
    .first<{ id: string; name: string; therapist_id: string }>();
  if (!patient) fail(404, "Patient not found");
  if (user.role === "therapist" && patient.therapist_id !== user.id) fail(404, "Patient not found");
  return patient;
}

/** Media keys start with the uploader's user id; anyone in the same therapist-patient circle can read them. */
export async function canReadMedia(env: Env, user: User, key: string) {
  const owner = key.split("/")[0];
  if (owner === user.id) return true;
  if (user.role === "patient") return owner === user.therapist_id;
  const row = await env.DB.prepare("SELECT 1 FROM users WHERE id = ? AND therapist_id = ?").bind(owner, user.id).first();
  return !!row;
}
