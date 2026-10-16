import { Pressable, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { Hint, Label, Screen, Section } from "../components/ui";
import { DATA, ORDER } from "../data/content";
import { C, F } from "../theme";

export default function Prices() {
  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <Label icon="price">Прайс по направлениям</Label>
        {ORDER.map((k) => (
          <Pressable key={k} style={s.row} onPress={() => router.push(`/direction/${k}`)}>
            <Text style={s.name}>{DATA[k].title}</Text>
            <Text style={s.val}>{DATA[k].price[0] === "—" ? "по запросу" : DATA[k].price[0]}</Text>
          </Pressable>
        ))}
        <Hint center style={{ marginTop: 14 }}>Пробное занятие по любому направлению — бесплатно</Hint>
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 15, paddingHorizontal: 2, borderBottomWidth: 1, borderBottomColor: C.hair },
  name: { fontSize: 15, fontFamily: F.sans, color: C.text },
  val: { fontFamily: F.serif, fontSize: 17, color: C.text },
});
