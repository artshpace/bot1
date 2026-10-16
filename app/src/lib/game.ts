import { ORDER, type DirKey } from "../data/content";
import { getCourse } from "./courses";

/* ═══════════ Игровая прокачка навыков ═══════════
   Навыки те же, что в «Карте навыков» сайта (таблица skills, миграция 0013),
   поэтому опыт в приложении и оценки педагога говорят об одном и том же. */

export const SKILLS: Record<DirKey, string[]> = {
  guitar: ["Постановка рук", "Чтение табов/нот", "Чувство ритма", "Репертуар"],
  acting: ["Сценическая речь", "Раскрепощённость", "Работа с текстом", "Импровизация"],
  vocals: ["Дыхание", "Интонация", "Диапазон", "Артикуляция"],
  dance: ["Координация", "Растяжка", "Музыкальность", "Хореография"],
  painting: ["Композиция", "Цвет", "Техника", "Воображение"],
};

/** Опыт, с которого начинается уровень навыка 0…5. */
export const SKILL_XP = [0, 20, 60, 140, 260, 420];
export const SKILL_TITLES = ["Не начат", "Начинающий", "Уверенный", "Продвинутый", "Профи", "Мастер"];

/** Опыт за разные действия. */
export const XP = { quizAnswer: 5, homework: 10, quest: 5, visit: 5, defaultLesson: 15 };

export const skillKey = (dir: string, skill: string) => `${dir}|${skill}`;

export type SkillView = {
  dir: DirKey; name: string; xp: number;
  /** уровень по опыту */
  xpLevel: number;
  /** уровень, который видит ученик (с учётом потолка) */
  level: number;
  /** уровень, поставленный педагогом в журнале (null — нет данных) */
  teacher: number | null;
  /** выше этого онлайн не подняться без оценки педагога */
  cap: number;
  capped: boolean;
  /** 0…1 — прогресс до следующего уровня */
  progress: number;
  toNext: number;
};

const levelFromXp = (xp: number) => { let l = 0; while (l < 5 && xp >= SKILL_XP[l + 1]) l++; return l; };

/**
 * Онлайн можно уйти максимум на 1 уровень выше подтверждённого педагогом
 * (не ниже 2 — чтобы новичок мог прокачаться и без журнала).
 */
export function skillView(dir: DirKey, name: string, xp: number, teacher: number | null): SkillView {
  const xpLevel = levelFromXp(xp);
  const cap = Math.min(5, Math.max(teacher ?? 0, 1) + 1);
  const level = Math.max(teacher ?? 0, Math.min(xpLevel, cap));
  const capped = xpLevel > level;
  const progress = level >= 5 ? 1 : capped ? 1 : (xp - SKILL_XP[level]) / (SKILL_XP[level + 1] - SKILL_XP[level]);
  return { dir, name, xp, xpLevel, level, teacher, cap, capped, progress: Math.max(0, Math.min(1, progress)), toNext: level >= 5 ? 0 : Math.max(0, SKILL_XP[level + 1] - xp) };
}

/** Общее мастерство в направлении: средний уровень навыков. */
export function mastery(skills: SkillView[]) {
  const avg = skills.reduce((a, s) => a + s.level, 0) / (skills.length || 1);
  const xp = skills.reduce((a, s) => a + s.xp, 0);
  return { level: Math.floor(avg), exact: avg, title: SKILL_TITLES[Math.floor(avg)], xp };
}

/** Опыт за урок: по разметке урока или по умолчанию в первый навык направления. */
export function lessonXp(code: string, idx: number): Record<string, number> {
  const course = getCourse(code);
  const les = course?.lessons[idx];
  if (!course?.direction || !les) return {};
  const has = les.skills && Object.values(les.skills).some((v) => v > 0);
  const base = has ? les.skills! : { [SKILLS[course.direction][0]]: XP.defaultLesson };
  const mult = les.boss ? 2 : 1;
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [skillKey(course.direction!, k), v * mult]));
}

/** Главный навык урока — сюда идёт опыт за тест и задание. */
export function primarySkill(code: string, idx: number): string | null {
  const course = getCourse(code);
  if (!course?.direction) return null;
  const les = course.lessons[idx];
  const first = les?.skills && Object.keys(les.skills).length ? Object.keys(les.skills)[0] : SKILLS[course.direction][0];
  return skillKey(course.direction, first);
}

/* ── Задания дня ── */
export type Quest = { id: string; dir: DirKey; skill: string; text: string };

const QUESTS: Record<DirKey, [string, string][]> = {
  acting: [
    ["Сценическая речь", "5 минут скороговорок: чётко, медленно, потом быстрее"],
    ["Раскрепощённость", "Расскажи кому-нибудь дома смешную историю с выражением"],
    ["Работа с текстом", "Прочитай вслух абзац книги, расставляя паузы"],
    ["Импровизация", "Придумай 3 разных окончания любимой сказки"],
    ["Сценическая речь", "Дыхательная гимнастика: 10 глубоких вдохов животом"],
    ["Раскрепощённость", "Покажи перед зеркалом 5 разных эмоций"],
  ],
  guitar: [
    ["Постановка рук", "10 минут: смена аккордов Am — C — G без остановки"],
    ["Чувство ритма", "Сыграй бой под метроном 5 минут"],
    ["Репертуар", "Сыграй любимую песню от начала до конца"],
    ["Чтение табов/нот", "Разбери 4 такта новой мелодии по табам"],
  ],
  vocals: [
    ["Дыхание", "Дыхательное упражнение «свеча»: 5 подходов"],
    ["Артикуляция", "Артикуляционная гимнастика 5 минут"],
    ["Интонация", "Спой гамму вверх и вниз 3 раза"],
    ["Диапазон", "Распевка «сирена» снизу вверх 5 раз"],
  ],
  dance: [
    ["Растяжка", "10 минут растяжки после разминки"],
    ["Координация", "Повтори связку из занятия 5 раз"],
    ["Музыкальность", "Станцуй импровизацию под одну песню"],
    ["Хореография", "Вспомни и повтори танец из занятия"],
  ],
  painting: [
    ["Композиция", "Сделай быстрый набросок того, что видишь из окна"],
    ["Цвет", "Смешай 5 оттенков одного цвета на палитре"],
    ["Техника", "Порисуй 10 минут линиями и штриховкой"],
    ["Воображение", "Нарисуй выдуманное животное"],
  ],
};

/** 3 задания на сегодня — одинаковые весь день, меняются каждый день. */
export function dailyQuests(dirs: DirKey[], date = new Date()): Quest[] {
  const list = (dirs.length ? dirs : (["acting", "guitar"] as DirKey[])).flatMap((d) =>
    QUESTS[d].map(([skill, text], i) => ({ id: `${d}-${i}`, dir: d, skill, text })));
  const seed = date.getFullYear() * 400 + date.getMonth() * 32 + date.getDate();
  // берём через одно, чтобы задания были из разных направлений и навыков
  const n = list.length;
  const start = (seed * 7) % n;
  const out: Quest[] = [];
  for (let i = 0; i < n && out.length < 3; i++) {
    const q = list[(start + i * 2 + (i * 2 >= n ? 1 : 0)) % n];
    if (!out.some((o) => o.id === q.id)) out.push(q);
  }
  return out;
}

/** 1 урок, 2 урока, 5 уроков */
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}
export const lessonsWord = (n: number) => `${n} ${plural(n, "урок", "урока", "уроков")}`;

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export const DIRS = ORDER;
