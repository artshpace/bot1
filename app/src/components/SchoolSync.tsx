import { useEffect } from "react";
import { useAccount } from "../lib/account";
import { useProgress } from "../lib/progress";

/** Переносит данные журнала студии в баллы и награды приложения. */
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
    if (!session) { setSchool({ linked: false, present: 0, maxSkill: 0 }); return; }
    if (!reports) return;
    // если у родителя несколько детей — считаем по самому активному
    const present = Math.max(0, ...reports.map((r) => r.stats.present));
    const maxSkill = Math.max(0, ...reports.flatMap((r) => r.skills.map((k) => k.level)));
    setSchool({ linked: true, present, maxSkill });
  }, [ready, session?.user.id, reports]);
  return null;
}
