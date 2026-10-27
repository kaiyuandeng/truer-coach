/** Gives each item its TrueCoach-style label: "A1", "A2" inside a superset, or just "C" when alone in its block. */
export function labelItems<T extends { block: string }>(items: T[]): (T & { label: string; superset: boolean })[] {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.block, (counts.get(it.block) ?? 0) + 1);
  const seen = new Map<string, number>();
  return items.map((it) => {
    const n = (seen.get(it.block) ?? 0) + 1;
    seen.set(it.block, n);
    const superset = (counts.get(it.block) ?? 0) > 1;
    return { ...it, superset, label: superset ? `${it.block}${n}` : it.block };
  });
}

/** Parses a hold or duration out of free-text instructions, e.g. "x :30 seconds each" or "3x10, hold 5s". */
export function parseSeconds(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase();
  let m = t.match(/(\d+):(\d{2})\b/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/(?:^|\s|x\s*):(\d{1,3})\b/);
  if (m) return Number(m[1]);
  m = t.match(/(\d+)\s*(?:s|sec|secs|second|seconds)\b/);
  if (m) return Number(m[1]);
  m = t.match(/(\d+)\s*(?:min|mins|minute|minutes)\b/);
  if (m) return Number(m[1]) * 60;
  return null;
}

/** Number of sets in instructions like "2x12" or "3 x 10". */
export function parseSets(text: string | null | undefined): number | null {
  const m = text?.match(/(\d+)\s*x\s*\d+/i);
  return m ? Number(m[1]) : null;
}
