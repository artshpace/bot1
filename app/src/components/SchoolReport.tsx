import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { DATA, type DirKey } from "../data/content";
import { useAccount, type AttendanceStatus, type StudentReport } from "../lib/account";
import { openLink } from "../lib/links";
import { SITE_URL } from "../config";
import { C, F } from "../theme";
import { Card, Hint, P, PrimaryButton, ProgressBar, RowLink } from "./ui";

const MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const fmt = (d: string) => { const [, m, day] = d.split("-").map(Number); return `${day} ${MON[m - 1]}`; };
const STATUS: Record<AttendanceStatus, { t: string; c: string }> = {
  present: { t: "Был", c: C.green },
  absent: { t: "Не был", c: C.red },
  excused: { t: "Уважит.", c: C.gold },
  sick: { t: "Болел", c: "#3A6EA5" },
};
const dirTitle = (d: string) => DATA[d as DirKey]?.title ?? d;

function Student({ r, single }: { r: StudentReport; single: boolean }) {
  const pct = r.stats.total ? r.stats.present / r.stats.total : 0;
  const byDir = r.skills.reduce<Record<string, StudentReport["skills"]>>((acc, k) => { (acc[k.direction] ||= []).push(k); return acc; }, {});
  return (
    <View style={{ marginBottom: 14 }}>
      {!single && <Text style={s.student}>{r.name}</Text>}
      {r.groups.length > 0 && <Hint style={{ marginTop: 0, marginBottom: 10 }}>{r.groups.map((g) => `${dirTitle(g.direction)} · ${g.name}`).join("\n")}</Hint>}

      <Card>
        <Text style={s.h}>Посещаемость</Text>
        {r.stats.total === 0 ? <P>Отметок пока нет — они появятся после первых занятий.</P> : <>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={s.big}>{Math.round(pct * 100)}%</Text>
            <Text style={s.sub}>посещено {r.stats.present} из {r.stats.total}</Text>
          </View>
          <View style={{ marginVertical: 10 }}><ProgressBar value={pct} color={C.green} /></View>
          <View style={s.legend}>
            {(Object.keys(STATUS) as AttendanceStatus[]).filter((k) => r.stats[k]).map((k) => (
              <View key={k} style={s.legendItem}><View style={[s.dot, { backgroundColor: STATUS[k].c }]} /><Text style={s.legendText}>{STATUS[k].t}: {r.stats[k]}</Text></View>
            ))}
          </View>
          {r.visits.slice(0, 8).map((v, i) => (
            <View key={i} style={s.visit}>
              <Text style={s.visitDate}>{fmt(v.date)}</Text>
              <Text style={s.visitTopic} numberOfLines={1}>{v.topic || v.group || "Занятие"}</Text>
              <Text style={[s.badge, { backgroundColor: STATUS[v.status].c }]}>{STATUS[v.status].t}</Text>
            </View>
          ))}
        </>}
      </Card>

      <Card>
        <Text style={s.h}>Навыки</Text>
        {r.skills.length === 0 ? <P>Педагог ещё не отметил навыки.</P> : Object.entries(byDir).map(([dir, list]) => (
          <View key={dir} style={{ marginBottom: 6 }}>
            <Text style={s.dir}>{dirTitle(dir)}</Text>
            {list.map((k) => (
              <View key={k.name} style={s.skill}>
                <Text style={s.skillName}>{k.name}</Text>
                <View style={s.pips}>{[1, 2, 3, 4, 5].map((n) => <View key={n} style={[s.pip, n <= k.level && { backgroundColor: C.gold, borderColor: C.gold }]} />)}</View>
              </View>
            ))}
          </View>
        ))}
      </Card>

      <Card>
        <Text style={s.h}>Оценки и комментарии педагога</Text>
        {r.assessments.length === 0 ? <P>Пока нет оценок.</P> : r.assessments.slice(0, 10).map((a) => (
          <View key={a.id} style={s.assess}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={s.visitDate}>{fmt(a.date)}</Text>
              {a.score != null && <Text style={s.score}>{a.score}</Text>}
            </View>
            {a.comment ? <P style={{ color: C.text, marginTop: 2 }}>{a.comment}</P> : null}
          </View>
        ))}
      </Card>
    </View>
  );
}

/** Успеваемость с очных занятий — из журнала студии на artshpace.kz. */
export function SchoolReport() {
  const { session, profile, reports, loading, error, refresh, signOut } = useAccount();

  if (!session) {
    return (
      <Card>
        <P>Войдите тем же аккаунтом, что на сайте artshpace.kz, — и здесь появятся посещаемость, навыки и оценки педагогов. За посещения начисляются баллы и награды.</P>
        <PrimaryButton title="Войти в кабинет студии" onPress={() => router.push("/login")} style={{ marginTop: 12 }} />
      </Card>
    );
  }

  const staff = profile && ["teacher", "admin", "director"].includes(profile.role);
  return (
    <View>
      <View style={s.acc}>
        <View style={{ flex: 1 }}>
          <Text style={s.accName}>{profile?.name || session.user.email}</Text>
          <Text style={s.sub}>{profile ? ROLE[profile.role] : ""}{loading ? " · обновляем…" : ""}</Text>
        </View>
        <Text style={s.link} onPress={refresh}>Обновить</Text>
        <Text style={[s.link, { marginLeft: 14 }]} onPress={signOut}>Выйти</Text>
      </View>

      {error && <Card style={{ borderColor: C.red }}><P>Не удалось загрузить данные: {error}</P></Card>}
      {!reports && loading && <ActivityIndicator color={C.red} style={{ marginVertical: 20 }} />}

      {staff ? (
        <Card>
          <P>Журнал, отметки и оценки педагоги и администраторы ведут в кабинете на сайте.</P>
          <RowLink icon="doc" title="Открыть журнал на сайте" onPress={() => openLink(SITE_URL + "account/journal.html")} />
        </Card>
      ) : reports && reports.length === 0 ? (
        <Card>
          <P>Аккаунт ещё не привязан к ученику в журнале студии. Напишите администратору — он привяжет вас (или вашего ребёнка), и данные появятся здесь.</P>
        </Card>
      ) : reports?.map((r) => <Student key={r.id} r={r} single={reports.length === 1} />)}
    </View>
  );
}

const ROLE: Record<string, string> = { student: "Ученик", parent: "Родитель", teacher: "Педагог", admin: "Администратор", director: "Руководитель" };

const s = StyleSheet.create({
  acc: { flexDirection: "row", alignItems: "center", backgroundColor: C.bg2, borderWidth: 1, borderColor: C.sep, borderRadius: 16, padding: 14, marginBottom: 12 },
  accName: { fontFamily: F.serif, fontSize: 16, color: C.text },
  link: { color: C.red, fontFamily: F.semi, fontSize: 13 },
  student: { fontFamily: F.serif, fontSize: 20, color: C.text, marginBottom: 4 },
  h: { fontFamily: F.serif, fontSize: 17, color: C.text, marginBottom: 8 },
  big: { fontFamily: F.serifHeavy, fontSize: 30, color: C.text },
  sub: { fontFamily: F.sans, fontSize: 12.5, color: C.hint },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { fontSize: 12, color: C.hint, fontFamily: F.sans },
  dot: { width: 9, height: 9, borderRadius: 5 },
  visit: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.sep },
  visitDate: { width: 52, fontSize: 12, color: C.hint, fontFamily: F.semi },
  visitTopic: { flex: 1, fontSize: 13, color: C.text, fontFamily: F.sans },
  badge: { color: "#fff", fontSize: 11, fontFamily: F.bold, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: "hidden" },
  dir: { fontFamily: F.bold, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: C.red, marginTop: 4, marginBottom: 4 },
  skill: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 10 },
  skillName: { flex: 1, fontSize: 13.5, color: C.text, fontFamily: F.sans },
  pips: { flexDirection: "row", gap: 4 },
  pip: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: C.hair, backgroundColor: C.bg },
  assess: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.sep },
  score: { fontFamily: F.serifHeavy, fontSize: 18, color: C.goldDark },
});
