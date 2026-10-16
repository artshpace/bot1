import type { StudentReport } from "./account";

export type UpcomingLesson = {
  at: Date; start: string; end?: string;
  groupId: string; group: string; direction: string; student: string;
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Ближайшие занятия по расписанию групп (как в журнале сайта), без отменённых. */
export function upcomingLessons(reports: StudentReport[] | null, days = 14, now = new Date()): UpcomingLesson[] {
  if (!reports) return [];
  const out: UpcomingLesson[] = [];
  for (const r of reports) {
    for (const g of r.groups) {
      for (let i = 0; i <= days; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
        for (const slot of g.schedule) {
          if (slot.day !== d.getDay() || !slot.start) continue;
          const [h, m] = slot.start.split(":").map(Number);
          const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m || 0);
          if (at <= now || r.cancelled.includes(`${g.id}|${ymd(d)}`)) continue;
          out.push({ at, start: slot.start, end: slot.end, groupId: g.id, group: g.name, direction: g.direction, student: r.name });
        }
      }
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

const DAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** «Сегодня», «Завтра» или «Среда, 21 октября». */
export function dayLabel(at: Date, now = new Date()) {
  const a = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((a - t) / 86400000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Завтра";
  const day = DAYS[at.getDay()];
  return `${day[0].toUpperCase()}${day.slice(1)}, ${at.getDate()} ${MON[at.getMonth()]}`;
}
