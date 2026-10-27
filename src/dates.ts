/** Local calendar date as YYYY-MM-DD (not UTC, so "today" matches the phone). */
export function ymd(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export function startOfWeek(s: string): string {
  // Weeks start on Monday.
  const d = parseYmd(s);
  const dow = (d.getDay() + 6) % 7;
  return addDays(s, -dow);
}

export function startOfMonth(s: string): string {
  return s.slice(0, 8) + "01";
}

export function monthLabel(s: string): string {
  return parseYmd(s).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function dayLabel(s: string, opts?: { long?: boolean }): string {
  const t = ymd();
  if (s === t) return "Today";
  if (s === addDays(t, 1)) return "Tomorrow";
  if (s === addDays(t, -1)) return "Yesterday";
  return parseYmd(s).toLocaleDateString(undefined, {
    weekday: opts?.long ? "long" : "short",
    month: opts?.long ? "long" : "short",
    day: "numeric",
  });
}

export function relTime(iso: string): string {
  const then = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").getTime();
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
