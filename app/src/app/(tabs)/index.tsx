import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Hero } from "../../components/Hero";
import { Icon } from "../../components/Icon";
import { Label, RowLink, Section } from "../../components/ui";
import { NextLessonCard } from "../../components/ScheduleBlocks";
import { DATA, ORDER } from "../../data/content";
import { levelOf, pointsOf, useProgress } from "../../lib/progress";
import { C, F } from "../../theme";

export default function Home() {
  const { state } = useProgress();
  const points = pointsOf(state);
  const lvl = levelOf(points);
  const awards = Object.keys(state.awards).length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 30 }}>
      <Hero
        eyebrow="Shpigotskiy Art Space"
        title={"Студия творческого\nразвития"}
        tagline={"Для детей и взрослых · Петропавловск\nГитара · актёрское · вокал · танцы · живопись"}
        video="media/intro.mp4"
      />
      <View style={s.stats}>
        {[["160+", "учеников"], ["5", "направлений"], ["7", "педагогов"]].map(([b, t], i) => (
          <View key={t} style={[s.stat, i > 0 && { borderLeftWidth: 1, borderLeftColor: C.hair }]}>
            <Text style={s.statB}>{b}</Text>
            <Text style={s.statT}>{t}</Text>
          </View>
        ))}
      </View>

      <Pressable style={({ pressed }) => [s.me, pressed && { opacity: 0.9 }]} onPress={() => router.navigate("/profile")}>
        <Icon name="trophy" size={26} color={C.gold} />
        <View style={{ flex: 1 }}>
          <Text style={s.meTitle}>{state.profile?.name ? state.profile.name.split(" ")[1] || state.profile.name : "Мой прогресс"}</Text>
          <Text style={s.meSub}>{lvl.title} · {points} баллов · наград: {awards}</Text>
        </View>
        <Icon name="chev" size={18} color="rgba(255,255,255,0.6)" />
      </Pressable>

      <NextLessonCard />

      <Section>
        <Label icon="spark">Направления</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }} style={{ marginHorizontal: -20, paddingLeft: 20 }}>
          {ORDER.map((k) => (
            <Pressable key={k} onPress={() => router.push(`/direction/${k}`)} style={({ pressed }) => [s.dir, pressed && { transform: [{ scale: 0.96 }], borderColor: C.gold }]}>
              <Icon name={DATA[k].icon} size={32} />
              <View>
                <Text style={s.dirB}>{DATA[k].title}</Text>
                <Text style={s.dirS}>{DATA[k].short}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </Section>

      <Section>
        <Label icon="more">Разделы</Label>
        <RowLink icon="price" title="Прайс" onPress={() => router.push("/prices")} />
        <RowLink icon="person" title="Преподаватели" onPress={() => router.push("/teachers")} />
        <RowLink icon="image" title="Выступления и работы" onPress={() => router.push("/gallery")} />
        <RowLink icon="trophy" title="Достижения студии" onPress={() => router.push("/achievements")} />
        <RowLink icon="laptop" title="Онлайн-курсы" onPress={() => router.navigate("/learn")} />
        <RowLink icon="info" title="О студии и контакты" onPress={() => router.push("/about")} />
        <RowLink icon="help" title="Правила и FAQ" onPress={() => router.push("/faq")} />
        <RowLink icon="doc" title="Публичная оферта" onPress={() => router.push("/offer")} />
      </Section>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  stats: { flexDirection: "row", paddingVertical: 18, paddingHorizontal: 22 },
  stat: { flex: 1, alignItems: "center" },
  statB: { fontFamily: F.serif, fontSize: 24, color: C.black },
  statT: { fontSize: 10.5, color: C.hint, fontFamily: F.sans },
  me: { marginHorizontal: 20, marginTop: 4, flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.black, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.gold },
  meTitle: { color: "#fff", fontFamily: F.serif, fontSize: 17 },
  meSub: { color: "rgba(255,255,255,0.7)", fontFamily: F.sans, fontSize: 12.5, marginTop: 2 },
  dir: { width: 140, height: 140, borderWidth: 1, borderColor: C.sep, borderRadius: 18, padding: 16, backgroundColor: C.bg2, justifyContent: "space-between" },
  dirB: { fontSize: 15, fontFamily: F.bold, color: C.text },
  dirS: { fontSize: 11, color: C.hint, fontFamily: F.sans },
});
