-- Onboarding pipeline: where each prospect is in the coach's sales process
-- (new lead -> 15 min pitch call -> 1 hour needs call -> decision), and which CRM they came from.
-- users.stage stays the client lifecycle and is kept in sync: new/pitch = lead, needs/decision = consult,
-- won = active, lost = churned.

CREATE TABLE lead_pipeline (
  patient_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  therapist_id TEXT NOT NULL REFERENCES users(id),
  step TEXT NOT NULL DEFAULT 'new' CHECK (step IN ('new', 'pitch', 'needs', 'decision', 'won', 'lost')),
  step_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Scheduled call times are local "YYYY-MM-DDTHH:MM"; *_done_at are set when the call happens.
  pitch_at TEXT,
  pitch_done_at TEXT,
  needs_at TEXT,
  needs_done_at TEXT,
  decided_at TEXT,
  lost_reason TEXT,
  -- Contact email from the CRM. Kept here, not users.email, which is the login and must stay unique.
  contact_email TEXT,
  -- Where the lead was ingested from, so re-imports update instead of duplicating.
  crm_provider TEXT,
  crm_external_id TEXT,
  imported_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX lead_pipeline_crm ON lead_pipeline (therapist_id, crm_provider, crm_external_id);
CREATE INDEX lead_pipeline_therapist ON lead_pipeline (therapist_id, step);

CREATE TABLE crm_imports (
  id TEXT PRIMARY KEY,
  therapist_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Existing prospects join the pipeline where their stage puts them.
INSERT INTO lead_pipeline (patient_id, therapist_id, step, step_changed_at, created_at)
SELECT id, therapist_id, CASE stage WHEN 'consult' THEN 'needs' ELSE 'new' END, stage_changed_at, created_at
FROM users WHERE role = 'patient' AND therapist_id IS NOT NULL AND stage IN ('lead', 'consult');
