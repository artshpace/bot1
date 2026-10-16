import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COURSES, ORDER, type DirKey } from "../data/content";
import { dailyQuests, lessonXp, primarySkill, SKILLS, skillKey, skillView, todayKey, XP, type SkillView } from "./game";

/* ═══════════ Прогресс ученика: баллы, опыт навыков, награды ═══════════
   Хранится на телефоне; при входе в кабинет студии синхронизируется с базой
   (см. lib/sync.ts и supabase/migrations/0032_game_progress.sql). */

export type EventType = "lesson" | "homework" | "course" | "booking" | "online_request" | "quiz" | "quest";
export type ActivityEvent = { type: EventType; at: string; ref?: string };

export type Profile = { name: string; phone: string };

export type State = {
  profile: Profile | null;
  /** код курса → сколько уроков пройдено по порядку */
  courses: Record<string, { done: number }>;
  lastCourse: string | null;
  /** "КОД:номер урока" → отчёт по домашнему заданию */
  homework: Record<string, { text: string; at: string }>;
  /** "КОД:номер урока" → результат первой попытки теста */
  quizzes: Record<string, { correct: number; total: number }>;
  /** "направление|навык" → накопленный опыт (онлайн) */
  xp: Record<string, number>;
  /** задания дня: дата → выполненные id */
  quests: Record<string, string[]>;
  viewedDirs: string[];
  events: ActivityEvent[];
  /** id награды → когда получена */
  awards: Record<string, string>;
  /** Сводка с очных занятий из кабинета студии (журнал педагога). */
  school: {
    linked: boolean; present: number; maxSkill: number;
    /** посещения по направлениям — дают опыт всем навыкам направления */
    visitsByDir: Record<string, number>;
    /** "направление|навык" → уровень от педагога (0…5) */
    teacherSkills: Record<string, number>;
  };
};

const EMPTY_SCHOOL: State["school"] = { linked: false, present: 0, maxSkill: 0, visitsByDir: {}, teacherSkills: {} };
export const EMPTY: State = {
  profile: null, courses: {}, lastCourse: null, homework: {}, quizzes: {}, xp: {}, quests: {},
  viewedDirs: [], events: [], awards: {}, school: EMPTY_SCHOOL,
};
const KEY = "artspace_state_v1";

/* ── Навыки ── */

/** Опыт навыка: онлайн + за посещения очных занятий направления. */
export const skillXp = (s: State, dir: string, skill: string) =>
  (s.xp[skillKey(dir, skill)] ?? 0) + (s.school.visitsByDir[dir] ?? 0) * XP.visit;

export function skillsOf(s: State, dir: DirKey): SkillView[] {
  return SKILLS[dir].map((name) => {
    const t = s.school.teacherSkills[skillKey(dir, name)];
    return skillView(dir, name, skillXp(s, dir, name), t ?? null);
  });
}

/** Направления ученика: группы в студии, открытые курсы, просмотренные направления. */
export function myDirections(s: State): DirKey[] {
  const set = new Set<string>();
  Object.keys(s.school.visitsByDir).forEach((d) => set.add(d));
  Object.keys(s.school.teacherSkills).forEach((k) => set.add(k.split("|")[0]));
  Object.keys(s.courses).forEach((c) => { const d = COURSES[c]?.direction; if (d) set.add(d); });
  Object.keys(s.xp).forEach((k) => set.add(k.split("|")[0]));
  return ORDER.filter((d) => set.has(d));
}

const maxSkillLevel = (s: State) => Math.max(0, ...ORDER.flatMap((d) => skillsOf(s, d).map((k) => k.level)));

/* ── Награды ── */

export type AwardDef = { id: string; title: string; desc: string; icon: string; check: (s: State) => boolean };

const count = (s: State, t: EventType) => s.events.filter((e) => e.type === t).length;
const bossDone = (s: State) => s.events.some((e) => {
  if (e.type !== "lesson" || !e.ref) return false;
  const [c, i] = e.ref.split(":");
  return !!COURSES[c]?.lessons[Number(i)]?.boss;
});

export const AWARDS: AwardDef[] = [
  { id: "profile", title: "Это я!", desc: "Заполнить профиль ученика", icon: "person", check: (s) => !!s.profile?.name },
  { id: "trial", title: "Смелый старт", desc: "Записаться на пробное занятие", icon: "cal", check: (s) => count(s, "booking") > 0 },
  { id: "explorer", title: "Исследователь", desc: "Посмотреть все направления студии", icon: "spark", check: (s) => ORDER.every((k) => s.viewedDirs.includes(k)) },
  { id: "first_lesson", title: "Первый шаг", desc: "Пройти первый онлайн-урок", icon: "play", check: (s) => count(s, "lesson") >= 1 },
  { id: "three_lessons", title: "Втянулся", desc: "Пройти 3 урока", icon: "star", check: (s) => count(s, "lesson") >= 3 },
  { id: "ten_lessons", title: "Упорство", desc: "Пройти 10 уроков", icon: "flame", check: (s) => count(s, "lesson") >= 10 },
  { id: "quiz_perfect", title: "Знаток", desc: "Ответить верно на все вопросы теста", icon: "check", check: (s) => Object.values(s.quizzes).some((q) => q.total > 0 && q.correct === q.total) },
  { id: "homework_first", title: "Домашка сдана", desc: "Сдать первое домашнее задание", icon: "doc", check: (s) => count(s, "homework") >= 1 },
  { id: "homework_five", title: "Отличник", desc: "Сдать 5 домашних заданий", icon: "check", check: (s) => count(s, "homework") >= 5 },
  { id: "boss", title: "Испытание пройдено", desc: "Пройти финал главы курса", icon: "trophy", check: bossDone },
  { id: "quests_first", title: "Задание дня", desc: "Выполнить первое задание дня", icon: "spark", check: (s) => count(s, "quest") >= 1 },
  { id: "quests_week", title: "Неделя практики", desc: "Выполнять задания дня 7 разных дней", icon: "flame", check: (s) => Object.values(s.quests).filter((d) => d.length).length >= 7 },
  { id: "streak3", title: "Три дня подряд", desc: "Заниматься 3 дня подряд", icon: "flame", check: (s) => bestStreak(s) >= 3 },
  { id: "skill3", title: "Продвинутый", desc: "Прокачать любой навык до 3 уровня", icon: "star", check: (s) => maxSkillLevel(s) >= 3 },
  { id: "course_done", title: "Выпускник", desc: "Полностью пройти онлайн-курс", icon: "trophy", check: (s) => count(s, "course") >= 1 },
  // ── за очные занятия: данные из журнала педагога на artshpace.kz ──
  { id: "account", title: "Свой человек", desc: "Войти в личный кабинет студии", icon: "person", check: (s) => s.school.linked },
  { id: "first_visit", title: "На сцене!", desc: "Прийти на первое занятие в студии", icon: "cal", check: (s) => s.school.present >= 1 },
  { id: "ten_visits", title: "Постоянство", desc: "Посетить 10 занятий в студии", icon: "check", check: (s) => s.school.present >= 10 },
  { id: "fifty_visits", title: "Сердце студии", desc: "Посетить 50 занятий в студии", icon: "flame", check: (s) => s.school.present >= 50 },
  { id: "skill_max", title: "Мастерство", desc: "Получить от педагога высший уровень навыка (5 из 5)", icon: "star", check: (s) => s.school.maxSkill >= 5 },
];

/* ── Баллы и общий уровень ── */

export const POINTS = { lesson: 10, homework: 5, course: 50, booking: 10, online_request: 0, quiz: 0, quest: 2, award: 20, visit: 10 };

export const LEVELS = [
  { min: 0, title: "Новичок" },
  { min: 50, title: "Ученик" },
  { min: 150, title: "Артист" },
  { min: 300, title: "Звезда сцены" },
  { min: 600, title: "Мастер" },
];

export function pointsOf(s: State): number {
  let p = 0;
  for (const e of s.events) p += POINTS[e.type] ?? 0;
  return p + Object.keys(s.awards).length * POINTS.award + s.school.present * POINTS.visit;
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

/* ── Серии ── */

const dayKey = (iso: string) => todayKey(new Date(iso));

/** Дни, когда были занятия (уроки, задания, тесты, задания дня). */
function studyDays(s: State): number[] {
  const days = new Set<string>();
  for (const e of s.events) if (e.type === "lesson" || e.type === "homework" || e.type === "quest" || e.type === "quiz") days.add(dayKey(e.at));
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

function addXp(xp: Record<string, number>, gain: Record<string, number>) {
  const out = { ...xp };
  for (const [k, v] of Object.entries(gain)) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** Слить локальный и сохранённый в базе прогресс (берём лучшее из обоих). */
export function mergeStates(a: State, b: Partial<State>): State {
  const maxRec = (x: Record<string, number>, y: Record<string, number> = {}) => {
    const o = { ...x }; for (const [k, v] of Object.entries(y)) o[k] = Math.max(o[k] ?? 0, v); return o;
  };
  const courses = { ...a.courses };
  for (const [k, v] of Object.entries(b.courses ?? {})) courses[k] = { done: Math.max(courses[k]?.done ?? 0, v.done) };
  const quests = { ...a.quests };
  for (const [k, v] of Object.entries(b.quests ?? {})) quests[k] = [...new Set([...(quests[k] ?? []), ...v])];
  const seen = new Set(a.events.map((e) => e.type + e.at + e.ref));
  const events = [...a.events, ...(b.events ?? []).filter((e) => !seen.has(e.type + e.at + e.ref))].sort((x, y) => x.at.localeCompare(y.at));
  const awards = { ...(b.awards ?? {}), ...a.awards };
  return {
    ...a,
    profile: a.profile ?? b.profile ?? null,
    courses, quests, events, awards,
    xp: maxRec(a.xp, b.xp),
    homework: { ...(b.homework ?? {}), ...a.homework },
    quizzes: { ...(b.quizzes ?? {}), ...a.quizzes },
    viewedDirs: [...new Set([...a.viewedDirs, ...(b.viewedDirs ?? [])])],
  };
}

/** Что сохранять в базе (без данных журнала — они и так там). */
export const syncPayload = (s: State) => { const { school: _school, ...rest } = s; return rest; };

export type XpGain = { id: number; items: { key: string; xp: number }[] };

type Ctx = {
  state: State;
  ready: boolean;
  /** Награды, о которых ещё не показали поздравление */
  pendingAwards: string[];
  dismissAward: () => void;
  /** Последний полученный опыт — для всплывающей плашки «+20 опыта» */
  xpGain: XpGain | null;
  setProfile: (p: Profile) => void;
  openCourse: (code: string) => void;
  completeLesson: (code: string, idx: number) => void;
  submitHomework: (code: string, idx: number, text: string) => void;
  answerQuiz: (code: string, idx: number, correct: number, total: number) => void;
  completeQuest: (id: string) => void;
  viewDirection: (key: string) => void;
  setSchool: (school: State["school"]) => void;
  mergeRemote: (remote: Partial<State>) => void;
  logEvent: (type: EventType, ref?: string) => void;
  reset: () => void;
};

const ProgressContext = createContext<Ctx | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(EMPTY);
  const [ready, setReady] = useState(false);
  const [pendingAwards, setPending] = useState<string[]>([]);
  const [xpGain, setXpGain] = useState<XpGain | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => { if (raw) { const saved = JSON.parse(raw); setState({ ...EMPTY, ...saved, school: { ...EMPTY_SCHOOL, ...saved.school } }); } })
      .catch(() => {})
      .finally(() => { loaded.current = true; setReady(true); });
  }, []);

  useEffect(() => {
    if (loaded.current) AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  /** Применить изменение, начислить награды, показать полученный опыт. */
  const update = useCallback((fn: (s: State) => State) => {
    setState((prev) => {
      const changed = fn(prev);
      const [next, fresh] = grantAwards(changed);
      if (fresh.length) setPending((p) => [...p, ...fresh.filter((id) => !p.includes(id))]);
      if (changed.xp !== prev.xp) {
        const items = Object.keys(changed.xp).filter((k) => (changed.xp[k] ?? 0) > (prev.xp[k] ?? 0)).map((k) => ({ key: k, xp: changed.xp[k] - (prev.xp[k] ?? 0) }));
        if (items.length) setXpGain({ id: Date.now(), items });
      }
      return next;
    });
  }, []);

  const ev = (type: EventType, ref?: string): ActivityEvent => ({ type, ref, at: new Date().toISOString() });

  const value = useMemo<Ctx>(() => ({
    state, ready, pendingAwards, xpGain,
    dismissAward: () => setPending((p) => p.slice(1)),
    setProfile: (profile) => update((s) => ({ ...s, profile })),
    openCourse: (code) => update((s) => ({ ...s, lastCourse: code, courses: s.courses[code] ? s.courses : { ...s.courses, [code]: { done: 0 } } })),
    completeLesson: (code, idx) => update((s) => {
      const done = s.courses[code]?.done ?? 0;
      if (idx !== done) return s; // уроки открываются строго по очереди
      const les = COURSES[code]?.lessons[idx];
      if (les?.boss && !s.homework[`${code}:${idx}`]) return s; // финал главы — только со сданным заданием
      const total = COURSES[code]?.lessons.length ?? 0;
      const events = [...s.events, ev("lesson", `${code}:${idx}`)];
      if (idx + 1 === total) events.push(ev("course", code));
      return { ...s, courses: { ...s.courses, [code]: { done: idx + 1 } }, events, xp: addXp(s.xp, lessonXp(code, idx)) };
    }),
    submitHomework: (code, idx, text) => update((s) => {
      const key = `${code}:${idx}`;
      const first = !s.homework[key];
      const skill = primarySkill(code, idx);
      return {
        ...s,
        homework: { ...s.homework, [key]: { text, at: new Date().toISOString() } },
        events: first ? [...s.events, ev("homework", key)] : s.events,
        xp: first && skill ? addXp(s.xp, { [skill]: XP.homework }) : s.xp,
      };
    }),
    answerQuiz: (code, idx, correct, total) => update((s) => {
      const key = `${code}:${idx}`;
      if (s.quizzes[key]) return s; // опыт — только за первую попытку
      const skill = primarySkill(code, idx);
      return {
        ...s,
        quizzes: { ...s.quizzes, [key]: { correct, total } },
        events: [...s.events, ev("quiz", key)],
        xp: skill && correct ? addXp(s.xp, { [skill]: correct * XP.quizAnswer }) : s.xp,
      };
    }),
    completeQuest: (id) => update((s) => {
      const today = todayKey();
      const done = s.quests[today] ?? [];
      const q = dailyQuests(myDirections(s)).find((x) => x.id === id);
      if (!q || done.includes(id)) return s;
      return {
        ...s,
        quests: { ...s.quests, [today]: [...done, id] },
        events: [...s.events, ev("quest", id)],
        xp: addXp(s.xp, { [skillKey(q.dir, q.skill)]: XP.quest }),
      };
    }),
    setSchool: (school) => update((s) => (JSON.stringify(s.school) === JSON.stringify(school) ? s : { ...s, school })),
    mergeRemote: (remote) => update((s) => mergeStates(s, remote)),
    viewDirection: (key) => update((s) => (s.viewedDirs.includes(key) ? s : { ...s, viewedDirs: [...s.viewedDirs, key] })),
    logEvent: (type, ref) => update((s) => ({ ...s, events: [...s.events, ev(type, ref)] })),
    reset: () => { setPending([]); setState(EMPTY); },
  }), [state, ready, pendingAwards, xpGain, update]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): Ctx {
  const c = useContext(ProgressContext);
  if (!c) throw new Error("useProgress вне ProgressProvider");
  return c;
}
