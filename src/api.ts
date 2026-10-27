export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Request failed");
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T = { ok: true }>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T = { ok: true }>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T = { ok: true }>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  del: <T = { ok: true }>(path: string) => request<T>("DELETE", path),
  async upload(file: Blob): Promise<{ key: string; type: string }> {
    const res = await fetch("/api/media", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Upload failed");
    return data as { key: string; type: string };
  },
};

export const mediaUrl = (key: string) => "/api/media/" + key;

// ---------- Types shared with the worker ----------

export type Me = {
  id: string;
  role: "therapist" | "patient";
  name: string;
  email: string | null;
  therapist_id: string | null;
  therapist_name: string | null;
  completed_count: number;
};

export type Exercise = {
  id: string;
  therapist_id: string | null;
  name: string;
  body_area: string | null;
  category: string | null;
  description: string | null;
  video_key: string | null;
  video_url: string | null;
  default_instructions: string | null;
  times_used?: number;
};

export type WorkoutSummary = {
  id: string;
  scheduled_on: string;
  title: string;
  notes: string | null;
  completed_at: string | null;
  pain_before: number | null;
  pain_after: number | null;
  comment_count: number;
  items: {
    id: string;
    block: string;
    done: number;
    name: string;
    exercise_id: string;
    instructions: string | null;
    position: number;
    result: string | null;
    pain: number | null;
  }[];
};

export type WorkoutItem = {
  id: string;
  exercise_id: string;
  position: number;
  block: string;
  instructions: string | null;
  result: string | null;
  result_media_key: string | null;
  result_media_type: string | null;
  pain: number | null;
  done: number;
  name: string;
  description: string | null;
  video_key: string | null;
  video_url: string | null;
  body_area: string | null;
  times_done: number;
};

export type Comment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author_name: string;
  author_role: "therapist" | "patient";
};

export type Workout = {
  id: string;
  patient_id: string;
  therapist_id: string;
  scheduled_on: string;
  title: string;
  notes: string | null;
  completed_at: string | null;
  pain_before: number | null;
  pain_after: number | null;
  items: WorkoutItem[];
  comments: Comment[];
};

export type Message = {
  id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  sender_id: string;
  sender_name: string;
};

export type PatientRow = {
  id: string;
  name: string;
  email: string | null;
  diagnosis: string | null;
  invite_code: string | null;
  archived: number;
  last_completed_at: string | null;
  scheduled_14d: number;
  completed_14d: number;
  next_scheduled_on: string | null;
  last_scheduled_on: string | null;
  unread_messages: number;
  unreviewed: number;
  avg_pain_14d: number | null;
  avg_pain_prev_14d: number | null;
};
