import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Card, Hint, Label, P, Screen, Section } from "../components/ui";
import { DATA, type DirKey } from "../data/content";
import { useStudioAchievements, type StudioAchievement } from "../lib/live";
import { C, F } from "../theme";

const CAT: Record<string, string> = { student: "Ученики", teacher: "Педагоги", play: "Спектакль", concert: "Концерт", exhibition: "Выставка", competition: "Конкурс" };
const MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const fmt = (d: string) => { const [y, m, day] = d.split("-").map(Number); return `${day} ${MON[m - 1]} ${y}`; };

function Item({ a }: { a: StudioAchievement }) {
  const [noPhoto, setNoPhoto] = useState(false);
  return (
    <Card style={a.featured ? { borderColor: C.gold } : undefined}>
      {a.photo_url && !noPhoto && <Image source={{ uri: a.photo_url }} onError={() => setNoPhoto(true)} contentFit="cover" style={s.photo} />}
      <Text style={s.meta}>{[CAT[a.category] ?? a.category, a.direction && DATA[a.direction as DirKey]?.title, fmt(a.event_date)].filter(Boolean).join(" · ")}</Text>
      <Text style={s.title}>{a.title}</Text>
      {a.participant_name ? <Text style={s.who}>{a.participant_name}</Text> : null}
      {a.description ? <P style={{ marginTop: 4 }}>{a.description}</P> : null}
    </Card>
  );
}

export default function Achievements() {
  const { data, failed } = useStudioAchievements();
  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <Label icon="trophy">Достижения студии</Label>
        {!data && !failed && <ActivityIndicator color={C.red} style={{ marginTop: 20 }} />}
        {failed && <Hint>Не удалось загрузить — проверьте интернет.</Hint>}
        {data?.length === 0 && <Hint>Скоро здесь появятся спектакли, концерты и победы наших учеников.</Hint>}
        {data?.map((a) => <Item key={a.id} a={a} />)}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  photo: { width: "100%", aspectRatio: 16 / 9, borderRadius: 12, marginBottom: 12, backgroundColor: C.bg3 },
  meta: { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.red, fontFamily: F.bold },
  title: { fontFamily: F.serif, fontSize: 18, color: C.text, marginTop: 4 },
  who: { fontFamily: F.semi, fontSize: 13, color: C.goldDark, marginTop: 2 },
});
