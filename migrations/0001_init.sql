-- Core schema for PT Coach.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('therapist', 'patient')),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  password_salt TEXT,
  -- Patients belong to one therapist.
  therapist_id TEXT REFERENCES users(id),
  -- Set while a patient has not yet claimed their account.
  invite_code TEXT UNIQUE,
  diagnosis TEXT,
  goals TEXT,
  notes TEXT,
  -- CRM fields for the coach's client pipeline.
  stage TEXT NOT NULL DEFAULT 'active' CHECK (stage IN ('lead', 'consult', 'active', 'paused', 'churned')),
  stage_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT,
  phone TEXT,
  monthly_rate INTEGER,
  follow_up_on TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE exercises (
  id TEXT PRIMARY KEY,
  -- NULL means a built-in exercise visible to every therapist.
  therapist_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  body_area TEXT,
  category TEXT,
  description TEXT,
  -- Either an uploaded file key in the media bucket or an external URL.
  video_key TEXT,
  video_url TEXT,
  default_instructions TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A workout is scheduled for one patient on one date, like a TrueCoach workout.
CREATE TABLE workouts (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES users(id),
  therapist_id TEXT NOT NULL REFERENCES users(id),
  scheduled_on TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  completed_at TEXT,
  pain_before INTEGER,
  pain_after INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Items are grouped into blocks (A, B, C...). Several items in one block form a superset (A1, A2).
CREATE TABLE workout_items (
  id TEXT PRIMARY KEY,
  workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  position INTEGER NOT NULL,
  block TEXT NOT NULL,
  instructions TEXT,
  -- Filled in by the patient.
  result TEXT,
  -- Optional photo or video the patient attached to their result.
  result_media_key TEXT,
  result_media_type TEXT,
  pain INTEGER,
  done INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE workout_comments (
  id TEXT PRIMARY KEY,
  workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Set when the coach has replied to or dismissed a patient's comment.
  handled_at TEXT
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES users(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);

CREATE INDEX idx_users_therapist ON users(therapist_id);
CREATE INDEX idx_workouts_patient ON workouts(patient_id, scheduled_on);
CREATE INDEX idx_items_workout ON workout_items(workout_id, position);
CREATE INDEX idx_items_exercise ON workout_items(exercise_id);
CREATE INDEX idx_comments_workout ON workout_comments(workout_id, created_at);
CREATE INDEX idx_messages_patient ON messages(patient_id, created_at);

-- Coach's workout CRM: reusable workout templates, grouped into folders and tagged.
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  therapist_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  notes TEXT,
  folder TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE template_items (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  position INTEGER NOT NULL,
  block TEXT NOT NULL,
  instructions TEXT
);

-- Programs (phases) lay templates out over weeks, e.g. "Phase 14": Week 1 Day 1, Week 1 Day 2...
CREATE TABLE programs (
  id TEXT PRIMARY KEY,
  therapist_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  weeks INTEGER NOT NULL DEFAULT 4,
  days_per_week INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE program_days (
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  day INTEGER NOT NULL,
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  PRIMARY KEY (program_id, week, day)
);

-- Remember which template or program a scheduled workout came from.
ALTER TABLE workouts ADD COLUMN template_id TEXT REFERENCES templates(id) ON DELETE SET NULL;
ALTER TABLE workouts ADD COLUMN program_id TEXT REFERENCES programs(id) ON DELETE SET NULL;

CREATE INDEX idx_templates_therapist ON templates(therapist_id, updated_at);
CREATE INDEX idx_template_items ON template_items(template_id, position);
CREATE INDEX idx_programs_therapist ON programs(therapist_id);
CREATE INDEX idx_workouts_therapist ON workouts(therapist_id, scheduled_on);

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
