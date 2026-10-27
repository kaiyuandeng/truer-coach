import initSqlJs from "sql.js/dist/sql-wasm.js";
import wasmBase64 from "virtual:sql-wasm";
import worker from "../worker/index";
import { d1, memoryKV } from "./d1";
import { clearCookies } from "./cookie";

// Runs the real worker (worker/index.ts) inside the page: SQLite compiled to wasm stands in for D1, a Map for
// Workers KV, and window.fetch is patched so the app's /api calls go to it. Nothing leaves the browser.

const migrations = import.meta.glob("../migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

const ORIGIN = "https://demo.local";
const blobUrls = new Map<string, string>();
let env: Record<string, unknown>;

export async function startBackend() {
  let SQL;
  try {
    const wasmBinary = Uint8Array.from(atob(wasmBase64), (ch) => ch.charCodeAt(0));
    SQL = await initSqlJs({ wasmBinary: wasmBinary.buffer });
  } catch {
    // Some hosts' content security policy refuses WebAssembly; the asm.js build is slower but always runs.
    SQL = await (await import("sql.js/dist/sql-asm.js")).default();
  }
  const db = new SQL.Database();
  db.exec("PRAGMA foreign_keys = ON;");
  for (const name of Object.keys(migrations).sort()) db.exec(migrations[name]);
  env = { DB: d1(db), MEDIA_KV: memoryKV(), DEMO_MODE: "true", SIGNUP_CODE: "" };

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, ORIGIN);
    if (url.origin !== ORIGIN && !raw.startsWith("/")) return realFetch(input, init);
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/demo/")) return realFetch(input, init);
    const req = new Request(ORIGIN + url.pathname + url.search, init);
    const res = await worker.fetch(req, env as never);
    if (url.pathname === "/api/media" && req.method === "POST" && res.ok && init?.body instanceof Blob) {
      const { key } = (await res.clone().json()) as { key: string };
      blobUrls.set(key, URL.createObjectURL(init.body));
    }
    return res;
  };
}

/** Signs in as the demo coach (n = 0) or demo client n, reseeding nothing; the worker seeds once per day. */
export async function signInAs(role: "coach" | "client", n = 1) {
  clearCookies();
  await worker.fetch(new Request(`${ORIGIN}/demo/${role}/${n}`), env as never);
}

export async function resetDemo() {
  clearCookies();
  await worker.fetch(new Request(`${ORIGIN}/demo/reset`), env as never);
}

// The page may be framed where alert, confirm and prompt are switched off; answer them the way a user clicking OK would.
window.confirm = () => true;
window.prompt = (_message?: string, value?: string) => value ?? "";

(globalThis as Record<string, unknown>).__demoMediaUrl = (key: string) => blobUrls.get(key) ?? "/api/media/" + key;
