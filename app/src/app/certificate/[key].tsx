import { Share, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Hint, PrimaryButton, Screen, Section } from "../../components/ui";
import { DATA } from "../../data/content";
import { useAccount } from "../../lib/account";
import { getCourse } from "../../lib/courses";
import { courseStats, useProgress } from "../../lib/progress";
import { C, F } from "../../theme";

const MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** Именной сертификат о прохождении онлайн-курса. */
export default function Certificate() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { state } = useProgress();
  const { profile } = useAccount();
  const c = getCourse(key);
  if (!c || !courseStats(state, key).complete) return null;
  const doneAt = state.events.find((e) => e.type === "course" && e.ref === key)?.at ?? new Date().toISOString();
  const d = new Date(doneAt);
  const date = `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
  const name = state.profile?.name || profile?.name || "Ученик студии";
  const num = `AS-${d.getFullYear()}-${(key + name).split("").reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 100000, 7).toString().padStart(5, "0")}`;

  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <View style={s.cert}>
          <View style={s.inner}>
            <Image source={require("../../../assets/splash-icon.png")} contentFit="contain" style={s.logo} />
            <Text style={s.eyebrow}>Сертификат</Text>
            <Text style={s.small}>настоящим подтверждается, что</Text>
            <Text style={s.name}>{name}</Text>
            <Text style={s.small}>успешно прошёл(-ла) онлайн-курс</Text>
            <Text style={s.course}>{c.title}</Text>
            {c.direction ? <Text style={s.dir}>{DATA[c.direction].title}</Text> : null}
            <View style={s.line} />
            <View style={s.foot}>
              <View>
                <Text style={s.footLabel}>Дата</Text>
                <Text style={s.footValue}>{date}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={s.footLabel}>Руководитель студии</Text>
                <Text style={s.sign}>А. А. Шпигоцкий</Text>
              </View>
            </View>
            <Text style={s.num}>№ {num} · Shpigotskiy Art Space · Петропавловск</Text>
          </View>
        </View>
        <PrimaryButton title="Поделиться" style={{ marginTop: 18 }}
          onPress={() => Share.share({ message: `${name} прошёл(-ла) онлайн-курс «${c.title}» в студии Shpigotskiy Art Space! Сертификат № ${num}, ${date}.` })} />
        <Hint center>Сделайте скриншот, чтобы сохранить сертификат как картинку.</Hint>
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  cert: { backgroundColor: C.paper, borderWidth: 2, borderColor: C.gold, borderRadius: 6, padding: 8 },
  inner: { borderWidth: 1, borderColor: C.hair, borderRadius: 3, paddingVertical: 26, paddingHorizontal: 18, alignItems: "center" },
  logo: { width: 110, height: 110, marginBottom: 8 },
  eyebrow: { fontFamily: F.serifHeavy, fontSize: 30, letterSpacing: 3, textTransform: "uppercase", color: C.red },
  small: { fontFamily: F.sans, fontSize: 12.5, color: C.hint, marginTop: 14, textAlign: "center" },
  name: { fontFamily: F.serifHeavy, fontSize: 26, color: C.text, marginTop: 6, textAlign: "center" },
  course: { fontFamily: F.serif, fontSize: 20, color: C.text, marginTop: 6, textAlign: "center" },
  dir: { fontFamily: F.bold, fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: C.goldDark, marginTop: 6 },
  line: { height: 1, alignSelf: "stretch", backgroundColor: C.hair, marginVertical: 20 },
  foot: { flexDirection: "row", justifyContent: "space-between", alignSelf: "stretch" },
  footLabel: { fontFamily: F.sans, fontSize: 10.5, color: C.hint },
  footValue: { fontFamily: F.semi, fontSize: 13.5, color: C.text, marginTop: 2 },
  sign: { fontFamily: F.serif, fontSize: 16, color: C.text, marginTop: 2, fontStyle: "italic" },
  num: { fontFamily: F.sans, fontSize: 10, color: C.hint, marginTop: 18 },
});
