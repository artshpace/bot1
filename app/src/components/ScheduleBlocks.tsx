import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { DATA, type DirKey } from "../data/content";
import { useAccount } from "../lib/account";
import { ensurePermission, loadPrefs, reschedule, savePrefs, type Prefs } from "../lib/notifications";
import { dayLabel, upcomingLessons } from "../lib/schedule";
import { C, F } from "../theme";
import { Icon } from "./Icon";
import { Card, Hint, P } from "./ui";

const dirTitle = (d: string) => DATA[d as DirKey]?.title ?? d;

/** Карточка «Следующее занятие» на главной (только после входа в кабинет). */
export function NextLessonCard() {
  const { reports } = useAccount();
  const next = upcomingLessons(reports)[0];
  if (!next) return null;
  return (
    <Pressable onPress={() => router.navigate("/profile")} style={({ pressed }) => [s.next, pressed && { opacity: 0.9 }]}>
      <View style={s.nextIcon}><Icon name={DATA[next.direction as DirKey]?.icon ?? "cal"} size={26} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.nextEyebrow}>Следующее занятие</Text>
        <Text style={s.nextTitle}>{dayLabel(next.at)}, {next.start}{next.end ? `–${next.end}` : ""}</Text>
        <Text style={s.nextSub} numberOfLines={1}>{dirTitle(next.direction)} · {next.group}{reports && reports.length > 1 ? ` · ${next.student}` : ""}</Text>
      </View>
      <Icon name="chev" size={18} color={C.hint} />
    </Pressable>
  );
}

/** Подтягивает напоминания при запуске и при обновлении расписания. */
export function RemindersSync() {
  const { reports } = useAccount();
  useEffect(() => {
    loadPrefs().then((p) => reschedule(p, upcomingLessons(reports))).catch(() => {});
  }, [reports]);
  return null;
}

/** «Моё расписание» в профиле + переключатели напоминаний. */
export function MySchedule() {
  const { session, reports } = useAccount();
  const [prefs, setPrefs] = useState<Prefs>({ lessons: false, quests: false });
  useEffect(() => { loadPrefs().then(setPrefs); }, []);
  const lessons = upcomingLessons(reports);

  async function toggle(k: keyof Prefs, v: boolean) {
    if (v && !(await ensurePermission())) {
      Alert.alert("Уведомления выключены", "Разрешите уведомления для приложения Art Space в настройках телефона.");
      return;
    }
    const p = { ...prefs, [k]: v };
    setPrefs(p); await savePrefs(p);
    reschedule(p, lessons).catch(() => {});
  }

  return (
    <View>
      {session ? (
        lessons.length ? (
          <Card>
            {lessons.slice(0, 6).map((l, i) => (
              <View key={l.groupId + l.at.toISOString()} style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: C.sep }]}>
                <View style={{ width: 96 }}>
                  <Text style={s.day}>{dayLabel(l.at)}</Text>
                  <Text style={s.time}>{l.start}{l.end ? `–${l.end}` : ""}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.dir}>{dirTitle(l.direction)}</Text>
                  <Text style={s.group} numberOfLines={1}>{l.group}{reports && reports.length > 1 ? ` · ${l.student}` : ""}</Text>
                </View>
              </View>
            ))}
          </Card>
        ) : <Card><P>Ближайших занятий в расписании групп нет. Если вы занимаетесь — попросите администратора добавить вас в группу в журнале.</P></Card>
      ) : <Hint style={{ marginTop: 0, marginBottom: 10 }}>Войдите в кабинет студии ниже — и здесь появится расписание ваших групп.</Hint>}

      <Card>
        <View style={s.sw}>
          <View style={{ flex: 1 }}>
            <Text style={s.swTitle}>Напоминать о занятиях</Text>
            <Text style={s.swSub}>За 2 часа до начала, по расписанию группы</Text>
          </View>
          <Switch value={prefs.lessons} onValueChange={(v) => toggle("lessons", v)} trackColor={{ true: C.red, false: C.bg3 }} thumbColor="#fff" />
        </View>
        <View style={[s.sw, { borderTopWidth: 1, borderTopColor: C.sep }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.swTitle}>Напоминать о заданиях дня</Text>
            <Text style={s.swSub}>Каждый день в 18:00</Text>
          </View>
          <Switch value={prefs.quests} onValueChange={(v) => toggle("quests", v)} trackColor={{ true: C.red, false: C.bg3 }} thumbColor="#fff" />
        </View>
      </Card>
    </View>
  );
}

const s = StyleSheet.create({
  next: { marginHorizontal: 20, marginTop: 10, flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.paper, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.gold },
  nextIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.bg2, alignItems: "center", justifyContent: "center" },
  nextEyebrow: { fontSize: 10.5, letterSpacing: 1.6, textTransform: "uppercase", color: C.red, fontFamily: F.bold },
  nextTitle: { fontFamily: F.serif, fontSize: 18, color: C.text, marginTop: 2 },
  nextSub: { fontFamily: F.sans, fontSize: 12.5, color: C.hint, marginTop: 1 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 },
  day: { fontFamily: F.bold, fontSize: 12.5, color: C.text },
  time: { fontFamily: F.serif, fontSize: 15, color: C.red },
  dir: { fontFamily: F.semi, fontSize: 14, color: C.text },
  group: { fontFamily: F.sans, fontSize: 12, color: C.hint },
  sw: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  swTitle: { fontFamily: F.semi, fontSize: 14, color: C.text },
  swSub: { fontFamily: F.sans, fontSize: 12, color: C.hint, marginTop: 1 },
});
