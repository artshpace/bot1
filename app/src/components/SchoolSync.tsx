import { useEffect } from "react";
import { useAccount } from "../lib/account";
import { skillKey } from "../lib/game";
import { useProgress } from "../lib/progress";

/** Переносит данные журнала студии в опыт, баллы и награды приложения. */
export function SchoolSync() {
  const { session, reports, profile } = useAccount();
  const { ready, setSchool, state, setProfile } = useProgress();

  // профиль ученика в приложении заполняем из кабинета, если он ещё пустой
  useEffect(() => {
    if (!ready || state.profile || !profile || !reports) return;
    const name = reports.length === 1 ? reports[0].name : profile.name;
    if (name) setProfile({ name, phone: profile.phone || "+7 " });
  }, [ready, profile, reports]);

  useEffect(() => {
    if (!ready) return;
    if (!session) { setSchool({ linked: false, present: 0, maxSkill: 0, visitsByDir: {}, teacherSkills: {} }); return; }
    if (!reports) return;
    // если у родителя несколько детей — показываем самого активного
    const r = [...reports].sort((a, b) => b.stats.present - a.stats.present)[0];
    const visitsByDir: Record<string, number> = {};
    r?.visits.forEach((v) => { if (v.status === "present" && v.direction) visitsByDir[v.direction] = (visitsByDir[v.direction] ?? 0) + 1; });
    const teacherSkills: Record<string, number> = {};
    r?.skills.forEach((k) => { teacherSkills[skillKey(k.direction, k.name)] = k.level; });
    setSchool({
      linked: true,
      present: r?.stats.present ?? 0,
      maxSkill: Math.max(0, ...(r?.skills.map((k) => k.level) ?? [])),
      visitsByDir, teacherSkills,
    });
  }, [ready, session?.user.id, reports]);
  return null;
}
