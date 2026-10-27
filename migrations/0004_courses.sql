-- Course marketplace: a coach packages one of their programs as a course and sells it.

CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  therapist_id TEXT NOT NULL REFERENCES users(id),
  -- The program a buyer gets scheduled. Programs used by a course can't be deleted.
  program_id TEXT NOT NULL REFERENCES programs(id),
  title TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  -- Who it's for and what they'll need, one point per line.
  highlights TEXT,
  level TEXT NOT NULL DEFAULT 'All levels',
  price_cents INTEGER NOT NULL DEFAULT 0,
  cover TEXT NOT NULL DEFAULT 'violet',
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per sale. Checkout is simulated for now, so payment_ref is a demo reference.
CREATE TABLE course_purchases (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  price_cents INTEGER NOT NULL,
  payment_ref TEXT,
  -- Set once the buyer picks a start date and training days.
  started_on TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Workouts scheduled from a purchase, so progress through a course is tracked separately from coach assignments.
ALTER TABLE workouts ADD COLUMN purchase_id TEXT REFERENCES course_purchases(id) ON DELETE SET NULL;

CREATE INDEX idx_courses_therapist ON courses(therapist_id, published);
CREATE INDEX idx_purchases_course ON course_purchases(course_id, created_at);
CREATE INDEX idx_purchases_buyer ON course_purchases(buyer_id, created_at);
CREATE INDEX idx_workouts_purchase ON workouts(purchase_id);
