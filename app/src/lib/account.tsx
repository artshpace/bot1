import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/* ═══════════ Личный кабинет студии (тот же аккаунт, что на artshpace.kz) ═══════════ */

export type Role = "student" | "parent" | "teacher" | "admin" | "director";
export type AccountProfile = { id: string; name: string; phone: string; role: Role; email: string };

export type AttendanceStatus = "present" | "absent" | "excused" | "sick";
export type StudentReport = {
  id: string;
  name: string;
  groups: { id: string; name: string; direction: string }[];
  visits: { date: string; status: AttendanceStatus; topic: string | null; group: string }[];
  stats: Record<AttendanceStatus, number> & { total: number };
  skills: { direction: string; name: string; level: number }[];
  assessments: { id: string; date: string; score: number | null; comment: string | null }[];
};

function translate(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "Неверный логин или пароль.";
  if (/email not confirmed/i.test(msg)) return "Подтвердите email по ссылке из письма и попробуйте снова.";
  if (/network|fetch/i.test(msg)) return "Нет связи с сервером. Проверьте интернет.";
  if (/rate limit/i.test(msg)) return "Слишком много попыток. Подождите минуту.";
  return msg;
}

/** Вход как на сайте: по email или по ФИО (ФИО → email через функцию email_by_name). */
async function signIn(login: string, password: string) {
  const v = login.trim();
  let email = v;
  if (!/\S+@\S+\.\S+/.test(v)) {
    const r = await supabase.rpc("email_by_name", { p_name: v });
    if (r.error) throw new Error(translate(r.error.message));
    if (!r.data) throw new Error("Не нашли аккаунт по ФИО — попробуйте войти по email.");
    email = r.data as string;
  }
  const res = await supabase.auth.signInWithPassword({ email, password });
  if (res.error) throw new Error(translate(res.error.message));
}

async function fetchProfile(session: Session): Promise<AccountProfile> {
  const u = session.user;
  const meta = (u.user_metadata ?? {}) as Record<string, string>;
  const { data } = await supabase.from("profiles").select("role,name,phone").eq("id", u.id).maybeSingle();
  return {
    id: u.id,
    email: u.email ?? "",
    name: data?.name || meta.name || "",
    phone: data?.phone || meta.phone || "",
    role: (data?.role || meta.role || "student") as Role,
  };
}

const rows = <T,>(r: { data: T[] | null; error: unknown }): T[] => {
  if (r.error) throw r.error;
  return r.data ?? [];
};

/** Ученики, которых видит аккаунт: он сам (students.user_id) и дети родителя (student_guardians). */
async function fetchReports(me: string): Promise<StudentReport[]> {
  const [own, links] = await Promise.all([
    supabase.from("students").select("id,name").eq("user_id", me),
    supabase.from("student_guardians").select("student_id").eq("parent_id", me),
  ]);
  const students = rows<{ id: string; name: string }>(own);
  const extra = rows<{ student_id: string }>(links).map((l) => l.student_id).filter((id) => !students.some((s) => s.id === id));
  if (extra.length) students.push(...rows<{ id: string; name: string }>(await supabase.from("students").select("id,name").in("id", extra)));
  return Promise.all(students.map(fetchReport));
}

async function fetchReport(s: { id: string; name: string }): Promise<StudentReport> {
  const [members, att, sskills, assess] = await Promise.all([
    supabase.from("group_members").select("group_id").eq("student_id", s.id),
    supabase.from("attendance").select("lesson_id,status").eq("student_id", s.id),
    supabase.from("student_skills").select("skill_id,level").eq("student_id", s.id),
    supabase.from("assessments").select("id,date,score,comment").eq("student_id", s.id).order("date", { ascending: false }),
  ]);
  const groupIds = rows<{ group_id: string }>(members).map((m) => m.group_id);
  const attRows = rows<{ lesson_id: string; status: AttendanceStatus }>(att);
  const skillRows = rows<{ skill_id: string; level: number }>(sskills);

  const [groupsR, lessonsR, skillsR] = await Promise.all([
    groupIds.length ? supabase.from("study_groups").select("id,name,direction").in("id", groupIds) : Promise.resolve({ data: [], error: null }),
    attRows.length ? supabase.from("lessons").select("id,date,topic,group_id").in("id", attRows.map((a) => a.lesson_id)) : Promise.resolve({ data: [], error: null }),
    skillRows.length ? supabase.from("skills").select("id,name,direction,sort").in("id", skillRows.map((k) => k.skill_id)) : Promise.resolve({ data: [], error: null }),
  ]);
  const groups = rows<{ id: string; name: string; direction: string }>(groupsR);
  const lessons = rows<{ id: string; date: string; topic: string | null; group_id: string }>(lessonsR);
  const skills = rows<{ id: string; name: string; direction: string; sort: number }>(skillsR);

  // группы, где ученик был отмечен, но уже не состоит — тоже нужны для подписей
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? "";
  const visits = attRows
    .map((a) => { const l = lessons.find((x) => x.id === a.lesson_id); return l && { date: l.date, status: a.status, topic: l.topic, group: groupName(l.group_id) }; })
    .filter((v): v is NonNullable<typeof v> => !!v)
    .sort((a, b) => b.date.localeCompare(a.date));

  const stats = { present: 0, absent: 0, excused: 0, sick: 0, total: visits.length };
  visits.forEach((v) => { stats[v.status]++; });

  return {
    id: s.id, name: s.name, groups, visits, stats,
    skills: skillRows
      .map((k) => { const sk = skills.find((x) => x.id === k.skill_id); return sk && { direction: sk.direction, name: sk.name, level: k.level, sort: sk.sort }; })
      .filter((v): v is NonNullable<typeof v> => !!v)
      .sort((a, b) => a.direction.localeCompare(b.direction) || a.sort - b.sort)
      .map(({ direction, name, level }) => ({ direction, name, level })),
    assessments: rows<StudentReport["assessments"][number]>(assess),
  };
}

type Ctx = {
  session: Session | null;
  profile: AccountProfile | null;
  ready: boolean;
  reports: StudentReport[] | null;
  loading: boolean;
  error: string | null;
  signIn: (login: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AccountContext = createContext<Ctx | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [reports, setReports] = useState<StudentReport[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!session) { setProfile(null); setReports(null); return; }
    setLoading(true); setError(null);
    try {
      const p = await fetchProfile(session);
      setProfile(p);
      setReports(await fetchReports(p.id));
    } catch (e) {
      setError(translate(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)));
    } finally {
      setLoading(false);
    }
  }, [session?.user.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo<Ctx>(() => ({
    session, profile, ready, reports, loading, error, refresh,
    signIn,
    signOut: async () => { await supabase.auth.signOut(); },
  }), [session, profile, ready, reports, loading, error, refresh]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): Ctx {
  const c = useContext(AccountContext);
  if (!c) throw new Error("useAccount вне AccountProvider");
  return c;
}
