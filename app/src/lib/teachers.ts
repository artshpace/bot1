import { DATA, ORDER, type Teacher } from "../data/content";

/** Все педагоги без повторов, в порядке направлений (как на сайте). */
export const TEACHERS: Teacher[] = (() => {
  const seen = new Set<string>();
  const out: Teacher[] = [];
  ORDER.forEach((k) => DATA[k].teachers.forEach((t) => { if (!seen.has(t.name)) { seen.add(t.name); out.push(t); } }));
  return out;
})();

export const teacherId = (t: Teacher) => TEACHERS.findIndex((x) => x.name === t.name);
export const bioText = (b: string | string[]) => (Array.isArray(b) ? b.join(" ") : b);
