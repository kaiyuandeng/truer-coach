import type { Env } from "./util";

/**
 * Photo and video storage. Uses R2 when the MEDIA bucket is bound, otherwise Workers KV, which needs no card
 * on file. KV values max out at 25 MiB, so files are split into chunks and range reads only fetch the chunks
 * they touch.
 */

const CHUNK = 20 * 1024 * 1024;

export const maxUpload = (env: Env) => (env.MEDIA ? 200 : 95) * 1024 * 1024;

type Meta = { type: string; size: number; chunks: number; etag: string };

export async function putMedia(env: Env, key: string, body: ReadableStream<Uint8Array>, type: string) {
  if (env.MEDIA) {
    await env.MEDIA.put(key, body, { httpMetadata: { contentType: type } });
    return;
  }
  const kv = env.MEDIA_KV!;
  let size = 0;
  let chunks = 0;
  let parts: Uint8Array[] = [];
  let buffered = 0;
  const flush = async () => {
    const buf = new Uint8Array(buffered);
    let o = 0;
    for (const p of parts) {
      buf.set(p, o);
      o += p.length;
    }
    await kv.put(`${key}#${chunks++}`, buf);
    parts = [];
    buffered = 0;
  };
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    let v = value;
    while (v.length) {
      const take = Math.min(v.length, CHUNK - buffered);
      parts.push(v.subarray(0, take));
      buffered += take;
      size += take;
      v = v.subarray(take);
      if (buffered === CHUNK) await flush();
    }
    if (size > maxUpload(env)) throw new Error("too large");
  }
  if (buffered || !chunks) await flush();
  const meta: Meta = { type, size, chunks, etag: `"${key.split("/")[1]}"` };
  await kv.put(key, JSON.stringify(meta));
}

export type MediaHead = { type: string; size: number; etag: string };

export async function headMedia(env: Env, key: string): Promise<MediaHead | null> {
  if (env.MEDIA) {
    const h = await env.MEDIA.head(key);
    return h && { type: h.httpMetadata?.contentType ?? "application/octet-stream", size: h.size, etag: h.httpEtag };
  }
  return env.MEDIA_KV!.get<Meta>(key, "json");
}

/** Bytes start..end inclusive. */
export async function readMedia(env: Env, key: string, start: number, end: number): Promise<BodyInit | null> {
  if (env.MEDIA) {
    const obj = await env.MEDIA.get(key, { range: { offset: start, length: end - start + 1 } });
    return obj?.body ?? null;
  }
  const kv = env.MEDIA_KV!;
  const first = Math.floor(start / CHUNK);
  const last = Math.floor(end / CHUNK);
  const out = new Uint8Array(end - start + 1);
  let o = 0;
  for (let i = first; i <= last; i++) {
    const chunk = await kv.get(`${key}#${i}`, "arrayBuffer");
    if (!chunk) return null;
    const from = i === first ? start - i * CHUNK : 0;
    const to = i === last ? end - i * CHUNK + 1 : chunk.byteLength;
    out.set(new Uint8Array(chunk, from, to - from), o);
    o += to - from;
  }
  return out;
}
