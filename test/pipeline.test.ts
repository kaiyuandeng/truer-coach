import { test } from "node:test";
import assert from "node:assert/strict";
import { funnel, mergeStep, normalizeLead, parseCsv, stampsForMove, stageForStep, stepFromCrm } from "../worker/pipeline-logic.ts";

const none = { pitch_done_at: null, needs_done_at: null, decided_at: null };

test("each step maps onto the client lifecycle stage", () => {
  assert.equal(stageForStep("new"), "lead");
  assert.equal(stageForStep("pitch"), "lead");
  assert.equal(stageForStep("needs"), "consult");
  assert.equal(stageForStep("decision"), "consult");
  assert.equal(stageForStep("won"), "active");
  assert.equal(stageForStep("lost"), "churned");
});

test("moving forward records calls as done, moving back clears them, lost keeps progress", () => {
  const d = stampsForMove(none, "decision", "T1");
  assert.deepEqual(d, { pitch_done_at: "T1", needs_done_at: "T1", decided_at: null });
  const back = stampsForMove(d, "needs", "T2");
  assert.deepEqual(back, { pitch_done_at: "T1", needs_done_at: null, decided_at: null });
  assert.deepEqual(stampsForMove(back, "lost", "T3"), { pitch_done_at: "T1", needs_done_at: null, decided_at: "T3" });
  assert.equal(stampsForMove(d, "won", "T4").decided_at, "T4");
});

test("CRM re-imports only move leads forward and never reopen decided ones", () => {
  assert.equal(mergeStep("needs", "pitch"), "needs");
  assert.equal(mergeStep("pitch", "decision"), "decision");
  assert.equal(mergeStep("won", "new"), "won");
  assert.equal(mergeStep("lost", "needs"), "lost");
  assert.equal(mergeStep("decision", "lost"), "lost");
});

test("common CRM stage names map to Evan's steps", () => {
  assert.equal(stepFromCrm("Intro call booked"), "pitch");
  assert.equal(stepFromCrm("Discovery"), "needs");
  assert.equal(stepFromCrm("Proposal sent"), "decision");
  assert.equal(stepFromCrm("Closed Won"), "won");
  assert.equal(stepFromCrm("Closed lost"), "lost");
  assert.equal(stepFromCrm("Something odd"), "new");
  assert.equal(stepFromCrm(undefined), "new");
});

test("normalizeLead builds names, falls back to email for ids, and drops unusable rows", () => {
  const l = normalizeLead({ first_name: "Rosa", last_name: "Delgado", email: "ROSA@Example.com", stage: "Discovery", amount: "400", needs_at: "2026-11-02T12:00" });
  assert.ok(l);
  assert.equal(l.name, "Rosa Delgado");
  assert.equal(l.email, "rosa@example.com");
  assert.equal(l.external_id, "rosa@example.com");
  assert.equal(l.step, "needs");
  assert.equal(l.monthly_rate, 400);
  assert.equal(l.needs_at, "2026-11-02T12:00");
  assert.equal(normalizeLead({ email: "x@y.com" }), null);
  assert.equal(normalizeLead({ name: "No Id" }), null);
  assert.equal(normalizeLead({ name: "Bad date", id: "1", pitch_at: "soon" })?.pitch_at, null);
});

test("parseCsv handles quotes, commas, and CRLF", () => {
  const rows = parseCsv('Name,Email,Notes\r\n"Fox, Jamie",jamie@x.com,"said ""hi"""\r\n\r\nLee,lee@x.com,\n');
  assert.deepEqual(rows, [
    { name: "Fox, Jamie", email: "jamie@x.com", notes: 'said "hi"' },
    { name: "Lee", email: "lee@x.com", notes: "" },
  ]);
});

test("funnel counts how far each lead got and the conversion between calls", () => {
  const row = (step: string, p: boolean, n: boolean, created = "2026-10-01", decided: string | null = null) =>
    ({ step, pitch_done_at: p ? "x" : null, needs_done_at: n ? "x" : null, created_at: created, decided_at: decided }) as never;
  const f = funnel(
    [
      row("new", false, false),
      row("needs", true, false),
      row("lost", true, false, "2026-10-01", "2026-10-05"),
      row("decision", true, true),
      row("won", true, true, "2026-10-01", "2026-10-11"),
      row("won", true, true, "2025-01-01", "2025-01-05"),
    ],
    "2026-07-01",
  );
  assert.equal(f.leads, 5);
  assert.equal(f.pitched, 4);
  assert.equal(f.needs, 2);
  assert.equal(f.won, 1);
  assert.equal(f.pitch_rate, 80);
  assert.equal(f.needs_rate, 50);
  assert.equal(f.close_rate, 50);
  assert.equal(f.win_rate, 50);
  assert.equal(f.days_to_sign, 10);
});
