import { StyleSheet, Text, View } from "react-native";
import { Label, Panel, PrimaryButton, Screen, Section } from "../../components/ui";
import { DATA, ORDER, type Direction } from "../../data/content";
import { router } from "expo-router";
import { C, F } from "../../theme";

const DAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const AGE_COLOR: Record<string, string> = { "4–6": "#C9A84C", "7–9": "#C9A84C", "7–10": "#E30613", "10–12": "#E30613", "11–15": "#1A1A1A", "14–17": "#9a7f2e" };

function Groups({ D }: { D: Direction }) {
  const groups = D.groups ?? [];
  const ages = [...new Set(groups.map((g) => g.age))];
  return (
    <View>
      <View style={s.legend}>
        {ages.map((a) => (
          <View key={a} style={s.legendItem}>
            <View style={[s.dot, { backgroundColor: AGE_COLOR[a] || C.red }]} />
            <Text style={s.legendText}>{a} лет</Text>
          </View>
        ))}
      </View>
      {groups.map((g) => {
        const col = AGE_COLOR[g.age] || C.red;
        return (
          <View key={g.n + g.time} style={s.grp}>
            <View style={[s.stripe, { backgroundColor: col }]} />
            <View style={s.top}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={[s.dot, { backgroundColor: col, marginRight: 8 }]} />
                <Text style={s.age}>{g.age} лет</Text>
              </View>
              <Text style={s.time}>{g.time}</Text>
            </View>
            <Text style={s.gnum}>Группа {g.n}</Text>
            <View style={s.week}>
              {WEEK_ORDER.map((wd) => {
                const on = g.days.includes(wd);
                return <Text key={wd} style={[s.d, on && s.dOn]}>{DAY_SHORT[wd]}</Text>;
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function Schedule() {
  return (
    <Screen back={false}>
      <Section style={{ paddingTop: 0 }}>
        <Label icon="cal">Расписание</Label>
        {ORDER.map((k) => (
          <Panel key={k} icon={DATA[k].icon} title={DATA[k].title}>
            <Groups D={DATA[k]} />
            <PrimaryButton title="Записаться на пробное" onPress={() => router.navigate({ pathname: "/book", params: { dir: k } })} style={{ marginTop: 4 }} />
          </Panel>
        ))}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16, marginHorizontal: 2 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { fontSize: 11.5, color: C.hint, fontFamily: F.sans },
  dot: { width: 10, height: 10, borderRadius: 5 },
  grp: { borderWidth: 1, borderColor: C.hair, borderRadius: 14, backgroundColor: C.bg, padding: 14, paddingLeft: 17, marginBottom: 10, overflow: "hidden" },
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  top: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  age: { fontFamily: F.serif, fontSize: 18, color: C.text },
  time: { fontFamily: F.serif, fontSize: 16, color: C.black },
  gnum: { fontSize: 11, color: C.hint, marginTop: 1, fontFamily: F.sans },
  week: { flexDirection: "row", gap: 5, marginTop: 11 },
  d: { flex: 1, textAlign: "center", fontSize: 11, fontFamily: F.semi, paddingVertical: 5, borderRadius: 7, backgroundColor: C.bg3, color: C.hint, overflow: "hidden" },
  dOn: { backgroundColor: C.green, color: "#fff" },
});
