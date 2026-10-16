import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Hero } from "../../components/Hero";
import { TeacherCard } from "../../components/TeacherCard";
import { Accordion, BackButton, Label, P, PrimaryButton, Section } from "../../components/ui";
import { DATA, type DirKey } from "../../data/content";
import { useProgress } from "../../lib/progress";
import { C, F } from "../../theme";

export default function DirectionScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const D = DATA[key as DirKey];
  const { viewDirection } = useProgress();
  useEffect(() => { if (D) viewDirection(key); }, [key]);
  if (!D) return null;
  const many = D.teachers.length > 1;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Hero eyebrow="Направление" title={D.title} tagline={D.tagline} video={D.video} />
        <Section>
          <Label icon="info">О курсе</Label>
          {D.accordion.map(([h, b], i) => (
            <Accordion key={h} title={h} initiallyOpen={i === 0}><P style={{ fontSize: 14 }}>{b}</P></Accordion>
          ))}
        </Section>
        <Section>
          <Label icon="person">{many ? "Педагоги" : "Педагог"}</Label>
          {many ? D.teachers.map((t) => <TeacherCard key={t.name} t={t} />) : D.teachers[0] && <TeacherCard t={D.teachers[0]} big />}
        </Section>
        <Section>
          <Label icon="price">Стоимость</Label>
          <View style={s.price}>
            <View style={[s.notch, { left: -9 }]} />
            <View style={[s.notch, { right: -9 }]} />
            <Text style={s.free}>Пробное занятие — бесплатно</Text>
            <Text style={s.big}>{D.price[0]}</Text>
            <Text style={s.sub}>{D.price[1]}</Text>
          </View>
          <PrimaryButton title="Записаться на это направление" style={{ marginTop: 16 }}
            onPress={() => router.navigate({ pathname: "/book", params: { dir: key } })} />
        </Section>
      </ScrollView>
      <BackButton />
    </View>
  );
}

const s = StyleSheet.create({
  price: { borderWidth: 1, borderColor: C.hair, borderRadius: 4, padding: 24, alignItems: "center", backgroundColor: C.paper },
  notch: { position: "absolute", top: "50%", marginTop: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: C.bg },
  free: { fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: C.goldDark, fontFamily: F.bold },
  big: { fontFamily: F.serifHeavy, fontSize: 38, marginTop: 8, marginBottom: 2, color: C.black },
  sub: { fontSize: 12.5, color: C.hint, fontFamily: F.sans },
});
