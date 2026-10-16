import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { DATA, ORDER } from "../data/content";
import { dailyQuests, mastery, todayKey, XP } from "../lib/game";
import { currentStreak, myDirections, skillsOf, useProgress } from "../lib/progress";
import { C, F } from "../theme";
import { Icon } from "./Icon";
import { Hint, Label } from "./ui";

/** Карточки «Моё мастерство» по направлениям ученика. */
export function MasteryCards() {
  const { state } = useProgress();
  const dirs = myDirections(state);
  return (
    <View>
      <Label icon="star">Моё мастерство</Label>
      {dirs.length === 0 && <Hint style={{ marginTop: -8, marginBottom: 10 }}>Пройдите онлайн-урок или войдите в кабинет студии — и здесь начнётся прокачка навыков.</Hint>}
      {(dirs.length ? dirs : ORDER.slice(0, 2)).map((d) => {
        const skills = skillsOf(state, d);
        const m = mastery(skills);
        return (
          <Pressable key={d} onPress={() => router.push(`/skills/${d}`)} style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={s.icon}><Icon name={DATA[d].icon} size={26} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.dir}>{DATA[d].title}</Text>
                <Text style={s.lvl}>{m.title} · уровень {m.level}/5 · {m.xp} опыта</Text>
              </View>
              <Icon name="chev" size={18} color="rgba(255,255,255,0.6)" />
            </View>
            <View style={s.bars}>
              {skills.map((k) => (
                <View key={k.name} style={{ flex: 1 }}>
                  <View style={s.pips}>{[1, 2, 3, 4, 5].map((n) => <View key={n} style={[s.pip, n <= k.level && { backgroundColor: C.gold }]} />)}</View>
                  <Text style={s.skill} numberOfLines={1}>{k.name}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Три задания дня: практика дома, отмечается самим учеником. */
export function DailyQuests() {
  const { state, completeQuest } = useProgress();
  const quests = dailyQuests(myDirections(state));
  const done = state.quests[todayKey()] ?? [];
  const streak = currentStreak(state);
  return (
    <View style={{ marginTop: 10 }}>
      <Label icon="flame">Задания дня</Label>
      <View style={s.qHead}>
        <Text style={s.qHeadText}>{done.length}/{quests.length} выполнено</Text>
        {streak > 0 && <Text style={s.streak}>🔥 {streak} {streak === 1 ? "день" : streak < 5 ? "дня" : "дней"} подряд</Text>}
      </View>
      {quests.map((q) => {
        const ok = done.includes(q.id);
        return (
          <Pressable key={q.id} disabled={ok} onPress={() => completeQuest(q.id)} style={({ pressed }) => [s.quest, ok && s.questDone, pressed && { transform: [{ scale: 0.98 }] }]}>
            <View style={[s.check, ok && { backgroundColor: C.green, borderColor: C.green }]}>
              {ok && <Icon name="check" size={14} color="#fff" strokeWidth={2.6} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.qText, ok && { color: C.hint, textDecorationLine: "line-through" }]}>{q.text}</Text>
              <Text style={s.qSkill}>{DATA[q.dir].title} · {q.skill} · +{XP.quest} опыта</Text>
            </View>
          </Pressable>
        );
      })}
      <Hint>Нажмите на задание, когда выполните его. Завтра будут новые.</Hint>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.black, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.gold },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.bg2, alignItems: "center", justifyContent: "center" },
  dir: { color: "#fff", fontFamily: F.serif, fontSize: 18 },
  lvl: { color: "rgba(255,255,255,0.7)", fontFamily: F.sans, fontSize: 12, marginTop: 1 },
  bars: { flexDirection: "row", gap: 10, marginTop: 14 },
  pips: { flexDirection: "row", gap: 2 },
  pip: { flex: 1, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.16)" },
  skill: { color: "rgba(255,255,255,0.6)", fontSize: 10, fontFamily: F.sans, marginTop: 4 },
  qHead: { flexDirection: "row", justifyContent: "space-between", marginTop: -8, marginBottom: 10 },
  qHeadText: { fontFamily: F.semi, fontSize: 12.5, color: C.hint },
  streak: { fontFamily: F.bold, fontSize: 12.5, color: C.red },
  quest: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: C.hair, backgroundColor: C.bg2, borderRadius: 14, padding: 14, marginBottom: 8 },
  questDone: { backgroundColor: C.bg, borderColor: C.sep },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.gold, alignItems: "center", justifyContent: "center" },
  qText: { fontFamily: F.semi, fontSize: 14, color: C.text },
  qSkill: { fontFamily: F.sans, fontSize: 11.5, color: C.hint, marginTop: 2 },
});
