import { StyleSheet, Text, View } from "react-native";
import { SKILL_TITLES, type SkillView } from "../lib/game";
import { C, F } from "../theme";
import { Icon } from "./Icon";

/** Навык как характеристика героя: уровень, звание, полоска опыта, потолок. */
export function SkillBar({ k, dark }: { k: SkillView; dark?: boolean }) {
  const text = dark ? "#fff" : C.text;
  const hint = dark ? "rgba(255,255,255,0.65)" : C.hint;
  return (
    <View style={s.row}>
      <View style={[s.lvl, k.level > 0 && { backgroundColor: C.gold, borderColor: C.gold }]}>
        <Text style={[s.lvlText, k.level > 0 && { color: C.black }]}>{k.level}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={s.top}>
          <Text style={[s.name, { color: text }]} numberOfLines={1}>{k.name}</Text>
          <Text style={[s.title, { color: k.level ? C.goldDark : hint }]}>{SKILL_TITLES[k.level]}</Text>
        </View>
        <View style={[s.track, { backgroundColor: dark ? "rgba(255,255,255,0.14)" : C.bg3 }]}>
          <View style={[s.fill, { width: `${Math.round(k.progress * 100)}%`, backgroundColor: k.capped ? C.hint : C.gold }]} />
        </View>
        <Text style={[s.sub, { color: hint }]}>
          {k.level >= 5 ? `${k.xp} опыта · максимальный уровень`
            : k.capped ? "Следующий уровень подтверждает педагог на занятии"
            : `${k.xp} опыта · до уровня ${k.level + 1}: ${k.toNext}`}
        </Text>
        {k.teacher != null && (
          <View style={s.teacher}>
            <Icon name="check" size={12} color={C.green} strokeWidth={2.4} />
            <Text style={[s.teacherText, { color: hint }]}>Педагог подтвердил уровень {k.teacher}</Text>
          </View>
        )}
      </View>
      {k.capped && <Icon name="lock" size={16} color={hint} />}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  lvl: { width: 34, height: 34, borderRadius: 10, borderWidth: 1.5, borderColor: C.hair, alignItems: "center", justifyContent: "center", transform: [{ rotate: "45deg" }] },
  lvlText: { fontFamily: F.serifHeavy, fontSize: 16, color: C.hint, transform: [{ rotate: "-45deg" }] },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 5 },
  name: { flex: 1, fontFamily: F.bold, fontSize: 14 },
  title: { fontFamily: F.semi, fontSize: 11.5 },
  track: { height: 7, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
  sub: { fontFamily: F.sans, fontSize: 11, marginTop: 4 },
  teacher: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  teacherText: { fontFamily: F.sans, fontSize: 11 },
});
