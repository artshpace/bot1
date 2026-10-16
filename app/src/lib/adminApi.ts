import type { CourseAward, DirKey, Lesson } from "../data/content";
import { supabase } from "./supabase";

/* Редактор курсов: запросы к таблицам online_courses / online_lessons / course_codes.
   Писать может только admin/director (правила доступа в миграции 0033). */

export type AdminCourse = {
  id?: string; title: string; direction: DirKey | null; summary: string; description: string;
  outcomes: string[]; cover_url: string; price: number | null; pay_url: string;
  awards: CourseAward[]; published: boolean; sort: number;
};
export type AdminLesson = { id?: string; course_id: string; sort: number; title: string; free: boolean; content: Omit<Lesson, "title" | "id" | "free"> };
export type CourseCode = { code: string; course_id: string; max_uses: number; used: number; note: string | null; created_at: string };

const fail = (e: { message: string } | null) => { if (e) throw new Error(/relation .* does not exist|schema cache/i.test(e.message) ? "В базе нет таблиц курсов. Примените миграцию 0033_online_courses.sql в Supabase." : e.message); };

export const emptyCourse = (): AdminCourse => ({
  title: "", direction: null, summary: "", description: "", outcomes: [], cover_url: "", price: null, pay_url: "",
  awards: [], published: false, sort: 0,
});

export async function listCourses() {
  const r = await supabase.from("online_courses").select("id,title,direction,published,price,sort").order("sort").order("created_at");
  fail(r.error);
  return (r.data ?? []) as (Pick<AdminCourse, "id" | "title" | "direction" | "published" | "price" | "sort">)[];
}

export async function getCourseFull(id: string) {
  const [c, l] = await Promise.all([
    supabase.from("online_courses").select("*").eq("id", id).single(),
    supabase.from("online_lessons").select("*").eq("course_id", id).order("sort").order("created_at"),
  ]);
  fail(c.error); fail(l.error);
  return { course: c.data as AdminCourse, lessons: (l.data ?? []) as AdminLesson[] };
}

export async function saveCourse(c: AdminCourse): Promise<string> {
  const row = { ...c, updated_at: new Date().toISOString() };
  if (c.id) { const r = await supabase.from("online_courses").update(row).eq("id", c.id); fail(r.error); return c.id; }
  const { id: _omit, ...ins } = row;
  const r = await supabase.from("online_courses").insert(ins).select("id").single();
  fail(r.error);
  return (r.data as { id: string }).id;
}

export async function deleteCourse(id: string) { fail((await supabase.from("online_courses").delete().eq("id", id)).error); }

export async function getLesson(id: string) {
  const r = await supabase.from("online_lessons").select("*").eq("id", id).single();
  fail(r.error);
  return r.data as AdminLesson;
}

export async function saveLesson(l: AdminLesson): Promise<string> {
  const row = { ...l, updated_at: new Date().toISOString() };
  if (l.id) { const r = await supabase.from("online_lessons").update(row).eq("id", l.id); fail(r.error); return l.id; }
  const { id: _omit, ...ins } = row;
  const r = await supabase.from("online_lessons").insert(ins).select("id").single();
  fail(r.error);
  return (r.data as { id: string }).id;
}

export async function deleteLesson(id: string) { fail((await supabase.from("online_lessons").delete().eq("id", id)).error); }

/** Переставить уроки: sort = позиция в списке. */
export async function reorderLessons(ids: string[]) {
  await Promise.all(ids.map((id, i) => supabase.from("online_lessons").update({ sort: i }).eq("id", id)));
}

export async function listCodes(courseId: string) {
  const r = await supabase.from("course_codes").select("*").eq("course_id", courseId).order("created_at", { ascending: false });
  fail(r.error);
  return (r.data ?? []) as CourseCode[];
}

/** Новый код: 8 символов без похожих букв/цифр (0/O, 1/I/L). */
export async function createCode(courseId: string, note: string, maxUses = 1) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const r = await supabase.from("course_codes").insert({ code, course_id: courseId, note: note || null, max_uses: maxUses });
  fail(r.error);
  return code;
}

export async function deleteCode(code: string) { fail((await supabase.from("course_codes").delete().eq("code", code)).error); }

/** ID ролика из любой ссылки YouTube (или сам ID). */
export function youtubeId(input: string): string {
  const v = input.trim();
  const m = v.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : v.replace(/[^A-Za-z0-9_-]/g, "");
}
