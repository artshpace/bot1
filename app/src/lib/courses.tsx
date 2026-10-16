import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COURSES, type Course, type CourseAward, type DirKey, type Lesson } from "../data/content";
import { supabase } from "./supabase";
import { useAccount } from "./account";

/* ═══════════ Онлайн-курсы ═══════════
   Курсы ведёт администратор в «Редакторе курсов» (таблицы online_courses /
   online_lessons, миграция 0033). Ученик видит каталог, открывает курс кодом
   доступа и проходит уроки. Всё кешируется на телефоне — работает без сети.
   Встроенный демо-курс (content.ts) доступен всегда. */

export type CourseInfo = Course & {
  key: string;                 // id курса в базе или код встроенного курса
  source: "local" | "db";
  enrolled: boolean;           // есть доступ к урокам
  outline: { title: string; free: boolean }[];
  published?: boolean;
};

/** Реестр загруженных курсов — его читают прогресс и игровой движок. */
const registry: Record<string, CourseInfo> = {};
for (const [code, c] of Object.entries(COURSES)) {
  registry[code] = { ...c, key: code, source: "local", enrolled: true, outline: c.lessons.map((l) => ({ title: l.title, free: !!l.free })) };
}

export const getCourse = (key: string): CourseInfo | undefined => registry[key];
export const allCourses = () => Object.values(registry);

type DbCourse = {
  id: string; title: string; direction: DirKey | null; summary: string | null; description: string | null;
  outcomes: string[] | null; cover_url: string | null; price: number | null; pay_url: string | null;
  awards: CourseAward[] | null; published: boolean; sort: number;
};
type DbLesson = { id: string; course_id: string; sort: number; title: string; free: boolean; content: Partial<Lesson> | null };

const CACHE = "artspace_courses_v1";

function toCourse(c: DbCourse, lessons: DbLesson[], enrolled: boolean, outline: CourseInfo["outline"]): CourseInfo {
  return {
    key: c.id, source: "db", enrolled, published: c.published,
    title: c.title, direction: c.direction ?? undefined, summary: c.summary ?? undefined,
    description: c.description ?? undefined, outcomes: c.outcomes ?? [], cover: c.cover_url ?? undefined,
    price: c.price, payUrl: c.pay_url, awards: Array.isArray(c.awards) ? c.awards : [],
    lessons: lessons.sort((a, b) => a.sort - b.sort).map((l) => ({ ...(l.content ?? {}), title: l.title, id: l.id, free: l.free })),
    outline,
  };
}

type Ctx = {
  /** опубликованные курсы + встроенные */
  catalog: CourseInfo[];
  loading: boolean;
  /** база ещё без таблиц курсов (миграция 0033 не применена) */
  unavailable: boolean;
  refresh: () => Promise<void>;
  /** активировать код: встроенный курс или курс из базы. Возвращает ключ курса. */
  redeem: (code: string) => Promise<string>;
};

const CoursesContext = createContext<Ctx | null>(null);

export function CoursesProvider({ children }: { children: ReactNode }) {
  const { session } = useAccount();
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const uid = session?.user.id;

  const apply = useCallback((list: CourseInfo[]) => {
    for (const k of Object.keys(registry)) if (registry[k].source === "db") delete registry[k];
    for (const c of list) registry[c.key] = c;
    setVersion((v) => v + 1);
  }, []);

  // сначала — из кеша, чтобы работало без сети
  useEffect(() => {
    AsyncStorage.getItem(CACHE).then((raw) => { if (raw) apply(JSON.parse(raw)); }).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const cr = await supabase.from("online_courses").select("*").order("sort");
      if (cr.error) { setUnavailable(true); return; }
      setUnavailable(false);
      const courses = (cr.data ?? []) as DbCourse[];
      const enrolled = new Set<string>();
      if (uid) {
        const er = await supabase.from("course_enrollments").select("course_id").eq("user_id", uid);
        (er.data ?? []).forEach((e: { course_id: string }) => enrolled.add(e.course_id));
      }
      const ids = courses.map((c) => c.id);
      // RLS отдаёт уроки только записанным (и бесплатные пробные — всем)
      const lr = ids.length ? await supabase.from("online_lessons").select("id,course_id,sort,title,free,content").in("course_id", ids) : { data: [] };
      const lessons = (lr.data ?? []) as DbLesson[];
      const outlines = await Promise.all(courses.map((c) =>
        supabase.rpc("course_outline", { p_course: c.id }).then((r) => ((r.data ?? []) as { title: string; free: boolean }[]))));
      const list = courses.map((c, i) => toCourse(c, lessons.filter((l) => l.course_id === c.id), enrolled.has(c.id), outlines[i]));
      apply(list);
      AsyncStorage.setItem(CACHE, JSON.stringify(list)).catch(() => {});
    } catch {
      // нет сети — остаёмся на кеше
    } finally {
      setLoading(false);
    }
  }, [uid, apply]);

  useEffect(() => { refresh(); }, [refresh]);

  const redeem = useCallback(async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (COURSES[code]) return code;
    if (!uid) throw new Error("Чтобы открыть курс по коду, войдите в кабинет студии (Профиль → Войти).");
    const r = await supabase.rpc("redeem_course_code", { p_code: code });
    if (r.error) throw new Error(/does not exist|schema cache/i.test(r.error.message) ? "Неверный код доступа" : r.error.message);
    await refresh();
    return r.data as string;
  }, [uid, refresh]);

  const value = useMemo<Ctx>(() => ({
    catalog: Object.values(registry).filter((c) => c.source === "local" || c.published),
    loading, unavailable, refresh, redeem,
  }), [version, loading, unavailable, refresh, redeem]);

  return <CoursesContext.Provider value={value}>{children}</CoursesContext.Provider>;
}

export function useCourses(): Ctx {
  const c = useContext(CoursesContext);
  if (!c) throw new Error("useCourses вне CoursesProvider");
  return c;
}
