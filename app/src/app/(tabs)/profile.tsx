import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card, Field, Hint, Input, Label, P, PrimaryButton, ProgressBar, Screen, Section } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { SchoolReport } from "../../components/SchoolReport";
import { MySchedule } from "../../components/ScheduleBlocks";
import { COURSES, DATA, type DirKey } from "../../data/content";
import { fioOk, normalizePhone } from "../../lib/links";
import { AWARDS, currentStreak, levelOf, POINTS, pointsOf, useProgress, type ActivityEvent } from "../../lib/progress";
import { C, F } from "../../theme";

const MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const fmtDate = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MON[d.getMonth()]}`; };

function eventText(e: ActivityEvent): string {
  const [code, idx] = (e.ref ?? "").split(":");
  const lesson = COURSES[code]?.lessons[Number(idx)]?.title;
  switch (e.type) {
    case "lesson": return `Пройден урок: ${lesson ?? e.ref}`;
    case "homework": return `Сдано задание: ${lesson ?? e.ref}`;
    case "course": return `Курс пройден: ${COURSES[e.ref ?? ""]?.title ?? e.ref}`;
    case "booking": return `Запись на пробное: ${DATA[e.ref as DirKey]?.title ?? e.ref}`;
    case "online_request": return `Заявка на онлайн-курс: ${e.ref}`;
    case "quiz": return `Тест к уроку: ${lesson ?? e.ref}`;
    case "quest": return "Выполнено задание дня";
  }
}

function ProfileForm({ onDone }: { onDone?: () => void }) {
  const { state, setProfile } = useProgress();
  const [name, setName] = useState(state.profile?.name ?? "");
  const [phone, setPhone] = useState(state.profile?.phone || "+7 ");
  const [tried, setTried] = useState(false);
  return (
    <Card>
      <Field label="ФИО ученика" error="Введите фамилию и имя" showError={tried && !fioOk(name)}>
        <Input value={name} onChangeText={setName} placeholder="Например: Иванов Иван" autoCapitalize="words" />
      </Field>
      <Field label="Телефон">
        <Input value={phone} onChangeText={(v) => setPhone(normalizePhone(v))} keyboardType="phone-pad" />
      </Field>
      <PrimaryButton title="Сохранить" onPress={() => { setTried(true); if (!fioOk(name)) return; setProfile({ name: name.trim(), phone: phone.trim() }); onDone?.(); }} />
      <Hint>Имя и телефон подставятся в заявки автоматически.</Hint>
    </Card>
  );
}

export default function ProfileTab() {
  const { state } = useProgress();
  const [editing, setEditing] = useState(false);
  const points = pointsOf(state);
  const lvl = levelOf(points);
  const streak = currentStreak(state);
  const n = (t: ActivityEvent["type"]) => state.events.filter((e) => e.type === t).length;
  const earned = AWARDS.filter((a) => state.awards[a.id]).length;
  const recent = [...state.events].reverse().slice(0, 8);

  return (
    <Screen back={false}>
      <Section style={{ paddingTop: 0 }}>
        <Label icon="person">Профиль ученика</Label>
        {!state.profile || editing ? (
          <ProfileForm onDone={() => setEditing(false)} />
        ) : (
          <View style={s.who}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{state.profile.name}</Text>
              {state.profile.phone.replace(/\D/g, "").length > 1 && <Text style={s.phone}>{state.profile.phone}</Text>}
            </View>
            <Text style={s.edit} onPress={() => setEditing(true)}>Изменить</Text>
          </View>
        )}

        <View style={s.level}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={s.medal}><Text style={s.medalText}>{lvl.index + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.lvlEyebrow}>Уровень</Text>
              <Text style={s.lvlTitle}>{lvl.title}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.points}>{points}</Text>
              <Text style={s.pointsLbl}>баллов</Text>
            </View>
          </View>
          <View style={{ marginTop: 16 }}><ProgressBar value={lvl.progress} color={C.gold} track="rgba(255,255,255,0.14)" /></View>
          <Text style={s.next}>{lvl.next ? `До уровня «${lvl.next}»: ${lvl.toNext} баллов` : "Максимальный уровень!"}</Text>
        </View>

        <View style={s.stats}>
          {[
            ["flame", String(streak), "дней подряд"],
            ["play", String(n("lesson")), "уроков"],
            ["doc", String(n("homework")), "заданий"],
            ["trophy", `${earned}/${AWARDS.length}`, "наград"],
          ].map(([icon, v, l]) => (
            <View key={l} style={s.stat}>
              <Icon name={icon} size={20} color={C.red} />
              <Text style={s.statV}>{v}</Text>
              <Text style={s.statL}>{l}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section>
        <Label icon="trophy">Награды</Label>
        <View style={s.grid}>
          {AWARDS.map((a) => {
            const at = state.awards[a.id];
            return (
              <View key={a.id} style={[s.award, !at && { opacity: 0.45 }]}>
                <View style={[s.badge, at ? { backgroundColor: C.black, borderColor: C.gold } : null]}>
                  <Icon name={at ? a.icon : "lock"} size={24} color={at ? C.gold : C.hint} />
                </View>
                <Text style={s.awTitle} numberOfLines={2}>{a.title}</Text>
                <Text style={s.awDesc} numberOfLines={3}>{at ? `Получена ${fmtDate(at)}` : a.desc}</Text>
              </View>
            );
          })}
        </View>
        <Hint>Баллы: урок +{POINTS.lesson}, задание +{POINTS.homework}, курс +{POINTS.course}, пробное +{POINTS.booking}, посещение студии +{POINTS.visit}, награда +{POINTS.award}.</Hint>
      </Section>

      <Section>
        <Label icon="cal">Моё расписание</Label>
        <MySchedule />
      </Section>

      <Section>
        <Label icon="star">Успеваемость в студии</Label>
        <SchoolReport />
      </Section>

      <Section>
        <Label icon="cal">История</Label>
        {recent.length === 0
          ? <Hint>Пока пусто. Откройте онлайн-курс или запишитесь на пробное занятие.</Hint>
          : recent.map((e, i) => (
            <View key={i} style={s.ev}>
              <Text style={s.evDate}>{fmtDate(e.at)}</Text>
              <Text style={s.evText}>{eventText(e)}</Text>
              <Text style={s.evPts}>{POINTS[e.type] ? `+${POINTS[e.type]}` : ""}</Text>
            </View>
          ))}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  who: { flexDirection: "row", alignItems: "center", backgroundColor: C.bg2, borderWidth: 1, borderColor: C.sep, borderRadius: 16, padding: 16, marginBottom: 12 },
  name: { fontFamily: F.serif, fontSize: 19, color: C.text },
  phone: { fontFamily: F.sans, fontSize: 13, color: C.hint, marginTop: 2 },
  edit: { color: C.red, fontFamily: F.semi, fontSize: 13 },
  level: { backgroundColor: C.black, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.gold, marginTop: 4 },
  medal: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: C.gold, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(201,168,76,0.12)" },
  medalText: { fontFamily: F.serifHeavy, fontSize: 24, color: C.gold },
  lvlEyebrow: { fontSize: 10.5, letterSpacing: 1.8, textTransform: "uppercase", color: C.gold, fontFamily: F.bold },
  lvlTitle: { fontFamily: F.serif, fontSize: 22, color: "#fff" },
  points: { fontFamily: F.serifHeavy, fontSize: 28, color: "#fff" },
  pointsLbl: { fontSize: 11, color: "rgba(255,255,255,0.65)", fontFamily: F.sans },
  next: { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 8, fontFamily: F.sans },
  stats: { flexDirection: "row", gap: 8, marginTop: 12 },
  stat: { flex: 1, alignItems: "center", backgroundColor: C.bg2, borderWidth: 1, borderColor: C.sep, borderRadius: 14, paddingVertical: 12 },
  statV: { fontFamily: F.serif, fontSize: 18, color: C.text, marginTop: 4 },
  statL: { fontSize: 10.5, color: C.hint, fontFamily: F.sans },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  award: { width: "31.5%", alignItems: "center", backgroundColor: C.bg2, borderWidth: 1, borderColor: C.sep, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 6 },
  badge: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: C.sep, alignItems: "center", justifyContent: "center", marginBottom: 8, backgroundColor: C.bg3 },
  awTitle: { fontFamily: F.bold, fontSize: 11.5, color: C.text, textAlign: "center" },
  awDesc: { fontFamily: F.sans, fontSize: 10.5, color: C.hint, textAlign: "center", marginTop: 2 },
  ev: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.hair },
  evDate: { width: 48, fontSize: 12, color: C.hint, fontFamily: F.semi },
  evText: { flex: 1, fontSize: 13.5, color: C.text, fontFamily: F.sans },
  evPts: { fontSize: 13, color: C.goldDark, fontFamily: F.bold },
});
