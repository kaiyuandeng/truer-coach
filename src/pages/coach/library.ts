import { useCallback, useEffect, useState } from "react";
import { api, type Exercise } from "../../api";

export type TemplateItem = {
  id: string;
  exercise_id: string;
  position: number;
  block: string;
  instructions: string | null;
  name: string;
  video_key: string | null;
  video_url: string | null;
  body_area: string | null;
};

export type Template = {
  id: string;
  name: string;
  notes: string | null;
  folder: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
  times_assigned: number;
  last_assigned_on: string | null;
  items: TemplateItem[];
};

/** The coach's exercise bank and saved workouts, shared by the board and editors. */
export function useCoachLibrary() {
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const reloadExercises = useCallback(() => api.get<Exercise[]>("/exercises").then(setExercises), []);
  const reloadTemplates = useCallback(() => api.get<Template[]>("/templates").then(setTemplates), []);
  useEffect(() => {
    reloadExercises();
    reloadTemplates();
  }, [reloadExercises, reloadTemplates]);
  return { exercises, templates, reloadExercises, reloadTemplates };
}
