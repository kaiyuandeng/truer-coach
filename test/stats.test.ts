import { test } from "node:test";
import assert from "node:assert/strict";
import { adherence, clientStats, histogram, quantile, sd, shift, slope, summarize, zScore, type DayRow } from "../src/pages/coach/stats.ts";

test("quantiles interpolate between neighbours", () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([5], 0.25), 5);
  assert.equal(quantile([], 0.5), null);
  assert.equal(quantile([3, 1, 2], 0), 1);
  assert.equal(quantile([3, 1, 2], 1), 3);
});

test("summary and z-score", () => {
  const s = summarize([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(s.mean, 5);
  assert.equal(s.sd, 2);
  assert.equal(sd([]), null);
  assert.equal(zScore(9, s), 2);
  assert.equal(zScore(1, summarize([1, 1])), null);
});

test("slope skips gaps but keeps their position", () => {
  assert.equal(slope([1, 2, 3]), 1);
  assert.equal(slope([1, null, 3]), 1);
  assert.equal(slope([null, 4]), null);
});

test("shift crosses month ends", () => {
  assert.equal(shift("2026-11-01", -1), "2026-10-31");
  assert.equal(shift("2026-12-31", 1), "2027-01-01");
});

test("adherence counts sessions in the window only", () => {
  const days: DayRow[] = [
    { date: "2026-10-01", planned: 1, done: 1, pain_after: 3 },
    { date: "2026-10-02", planned: 2, done: 1, pain_after: null },
    { date: "2026-10-10", planned: 1, done: 0, pain_after: null },
  ];
  assert.deepEqual(adherence(days, "2026-10-01", "2026-10-05"), { done: 2, planned: 3, rate: 2 / 3 });
  assert.equal(adherence(days, "2026-11-01", "2026-11-05").rate, null);
});

test("client stats leave today out of the 14-day window", () => {
  const today = "2026-10-27";
  const days: DayRow[] = [
    { date: today, planned: 1, done: 0, pain_after: null },
    { date: shift(today, -1), planned: 1, done: 1, pain_after: 2 },
    { date: shift(today, -3), planned: 1, done: 0, pain_after: null },
    { date: shift(today, -20), planned: 1, done: 1, pain_after: 5 },
  ];
  const s = clientStats(days, today);
  assert.equal(s.adh14, 0.5);
  assert.equal(s.adhPrev, 1);
  assert.equal(s.pain14, 2);
  assert.equal(s.dPain, -3);
  assert.equal(s.weeks.length, 8);
  assert.equal(s.weeks[7].start, shift(today, -7));
  assert.equal(s.weeks[7].adherence, 0.5);
});

test("histogram puts 100% in the top bin", () => {
  assert.deepEqual(histogram([0, 0.05, 0.55, 1], 10), [2, 0, 0, 0, 0, 1, 0, 0, 0, 1]);
});
