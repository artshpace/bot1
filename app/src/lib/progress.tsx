import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COURSES, ORDER } from "../data/content";

/* ═══════════ Прогресс ученика, баллы и награды ═══════════
   Пока всё хранится на телефоне. Когда появится сервер, этот модуль
   станет синхронизировать то же состояние с ним. */

export type EventType = "lesson" | "homework" | "course" | "booking" | "online_request";
export type ActivityEvent = { type: EventType; at: string; ref?: string };

export type Profile = { name: string; phone: string };

export type State = {
  profile: Profile | null;
  /** код курса → сколько уроков пройдено по порядку */
  courses: Record<string, { done: number }>;
  lastCourse: string | null;
  /** "КОД:номер урока" → отчёт по домашнему заданию */
  homework: Record<string, { text: string; at: string }>;
  viewedDirs: string[];
  events: ActivityEvent[];
  /** id награды → когда получена */
  awards: Record<string, string>;
};

const EMPTY: State = { profile: null, courses: {}, lastCourse: null, homework: {}, viewedDirs: [], events: [], awards: {} };
const KEY = "artspace_state_v1";

export type AwardDef = { id: string; title: string; desc: string; icon: string; check: (s: State) => boolean };

const count = (s: State, t: EventType) => s.events.filter((e) => e.type === t).length;

export const AWARDS: AwardDef[] = [
  { id: "profile", title: "Это я!", desc: "Заполнить профиль ученика", icon: "person", check: (s) => !!s.profile?.name },
  { id: "trial", title: "Смелый старт", desc: "Записаться на пробное занятие", icon: "cal", check: (s) => count(s, "booking") > 0 },
  { id: "explorer", title: "Исследователь", desc: "Посмотреть все направления студии", icon: "spark", check: (s) => ORDER.every((k) => s.viewedDirs.includes(k)) },
  { id: "first_lesson", title: "Первый шаг", desc: "Пройти первый онлайн-урок", icon: "play", check: (s) => count(s, "lesson") >= 1 },
  { id: "three_lessons", title: "Втянулся", desc: "Пройти 3 урока", icon: "star", check: (s) => count(s, "lesson") >= 3 },
  { id: "ten_lessons", title: "Упорство", desc: "Пройти 10 уроков", icon: "flame", check: (s) => count(s, "lesson") >= 10 },
  { id: "homework_first", title: "Домашка сдана", desc: "Сдать первое домашнее задание", icon: "doc", check: (s) => count(s, "homework") >= 1 },
  { id: "homework_five", title: "Отличник", desc: "Сдать 5 домашних заданий", icon: "check", check: (s) => count(s, "homework") >= 5 },
  { id: "streak3", title: "Три дня подряд", desc: "Заниматься 3 дня подряд", icon: "flame", check: (s) => bestStreak(s) >= 3 },
  { id: "course_done", title: "Выпускник", desc: "Полностью пройти онлайн-курс", icon: "trophy", check: (s) => count(s, "course") >= 1 },
];

export const POINTS = { lesson: 10, homework: 5, course: 50, booking: 10, online_request: 0, award: 20 };

export const LEVELS = [
  { min: 0, title: "Новичок" },
  { min: 50, title: "Ученик" },
  { min: 150, title: "Артист" },
  { min: 300, title: "Звезда сцены" },
  { min: 600, title: "Мастер" },
];

export function pointsOf(s: State): number {
  let p = 0;
  for (const e of s.events) p += POINTS[e.type];
  return p + Object.keys(s.awards).length * POINTS.award;
}

export function levelOf(points: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].min) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1];
  return {
    index: i, title: cur.title, next: next?.title ?? null, toNext: next ? next.min - points : 0,
    progress: next ? (points - cur.min) / (next.min - cur.min) : 1,
  };
}

const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

/** Дни, когда были занятия (уроки или домашние задания). */
function studyDays(s: State): number[] {
  const days = new Set<string>();
  for (const e of s.events) if (e.type === "lesson" || e.type === "homework") days.add(dayKey(e.at));
  return [...days].map((k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d).getTime(); }).sort((a, b) => a - b);
}

const DAY = 86400000;

function bestStreak(s: State): number {
  const days = studyDays(s);
  let best = 0, run = 0;
  days.forEach((d, i) => { run = i > 0 && Math.round((d - days[i - 1]) / DAY) === 1 ? run + 1 : 1; best = Math.max(best, run); });
  return best;
}

/** Текущая серия: сколько дней подряд до сегодня (или до вчера). */
export function currentStreak(s: State): number {
  const days = studyDays(s);
  if (!days.length) return 0;
  const t = new Date(); const today = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  let last = days[days.length - 1];
  if (Math.round((today - last) / DAY) > 1) return 0;
  let run = 1;
  for (let i = days.length - 2; i >= 0; i--) {
    if (Math.round((last - days[i]) / DAY) === 1) { run++; last = days[i]; } else break;
  }
  return run;
}

/** Выдать награды, условия которых выполнены. Возвращает новое состояние и id новых наград. */
function grantAwards(s: State): [State, string[]] {
  const fresh: string[] = [];
  const awards = { ...s.awards };
  const now = new Date().toISOString();
  for (const a of AWARDS) if (!awards[a.id] && a.check(s)) { awards[a.id] = now; fresh.push(a.id); }
  return [fresh.length ? { ...s, awards } : s, fresh];
}

type Ctx = {
  state: State;
  ready: boolean;
  /** Награды, о которых ещё не показали поздравление */
  pendingAwards: string[];
  dismissAward: () => void;
  setProfile: (p: Profile) => void;
  openCourse: (code: string) => void;
  completeLesson: (code: string, idx: number) => void;
  submitHomework: (code: string, idx: number, text: string) => void;
  viewDirection: (key: string) => void;
  logEvent: (type: EventType, ref?: string) => void;
  reset: () => void;
};

const ProgressContext = createContext<Ctx | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(EMPTY);
  const [ready, setReady] = useState(false);
  const [pendingAwards, setPending] = useState<string[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => { if (raw) setState({ ...EMPTY, ...JSON.parse(raw) }); })
      .catch(() => {})
      .finally(() => { loaded.current = true; setReady(true); });
  }, []);

  useEffect(() => {
    if (loaded.current) AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  /** Применить изменение, начислить награды и поставить поздравления в очередь. */
  const update = useCallback((fn: (s: State) => State) => {
    setState((prev) => {
      const [next, fresh] = grantAwards(fn(prev));
      if (fresh.length) setPending((p) => [...p, ...fresh.filter((id) => !p.includes(id))]);
      return next;
    });
  }, []);

  const ev = (type: EventType, ref?: string): ActivityEvent => ({ type, ref, at: new Date().toISOString() });

  const value = useMemo<Ctx>(() => ({
    state, ready, pendingAwards,
    dismissAward: () => setPending((p) => p.slice(1)),
    setProfile: (profile) => update((s) => ({ ...s, profile })),
    openCourse: (code) => update((s) => ({ ...s, lastCourse: code, courses: s.courses[code] ? s.courses : { ...s.courses, [code]: { done: 0 } } })),
    completeLesson: (code, idx) => update((s) => {
      const done = s.courses[code]?.done ?? 0;
      if (idx !== done) return s; // уроки открываются строго по очереди
      const total = COURSES[code]?.lessons.length ?? 0;
      const events = [...s.events, ev("lesson", `${code}:${idx}`)];
      if (idx + 1 === total) events.push(ev("course", code));
      return { ...s, courses: { ...s.courses, [code]: { done: idx + 1 } }, events };
    }),
    submitHomework: (code, idx, text) => update((s) => {
      const key = `${code}:${idx}`;
      const first = !s.homework[key];
      return {
        ...s,
        homework: { ...s.homework, [key]: { text, at: new Date().toISOString() } },
        events: first ? [...s.events, ev("homework", key)] : s.events,
      };
    }),
    viewDirection: (key) => update((s) => (s.viewedDirs.includes(key) ? s : { ...s, viewedDirs: [...s.viewedDirs, key] })),
    logEvent: (type, ref) => update((s) => ({ ...s, events: [...s.events, ev(type, ref)] })),
    reset: () => { setPending([]); setState(EMPTY); },
  }), [state, ready, pendingAwards, update]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): Ctx {
  const c = useContext(ProgressContext);
  if (!c) throw new Error("useProgress вне ProgressProvider");
  return c;
}
