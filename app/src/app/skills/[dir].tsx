import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Card, Hint, Label, P, ProgressBar, Screen, Section } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { SkillBar } from "../../components/SkillBar";
import { DATA, type DirKey } from "../../data/content";
import { mastery, SKILL_TITLES, XP } from "../../lib/game";
import { skillsOf, useProgress } from "../../lib/progress";
import { C, F } from "../../theme";

export default function SkillsScreen() {
  const { dir } = useLocalSearchParams<{ dir: string }>();
  const D = DATA[dir as DirKey];
  const { state } = useProgress();
  if (!D) return null;
  const skills = skillsOf(state, dir as DirKey);
  const m = mastery(skills);

  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <Label icon={D.icon}>Мастерство · {D.title}</Label>
        <View style={s.hero}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={s.badge}><Icon name={D.icon} size={34} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>Уровень {m.level} из 5</Text>
              <Text style={s.title}>{m.title}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.xp}>{m.xp}</Text>
              <Text style={s.xpLbl}>опыта</Text>
            </View>
          </View>
          <View style={{ marginTop: 14 }}><ProgressBar value={m.exact / 5} color={C.gold} track="rgba(255,255,255,0.14)" /></View>
          <View style={{ marginTop: 6 }}>
            {skills.map((k) => <SkillBar key={k.name} k={k} dark />)}
          </View>
        </View>

        <Label icon="spark" style={{ marginTop: 24 }}>Как прокачаться</Label>
        <Card>
          <P>• Онлайн-урок — опыт в навыки урока (финал главы — вдвое больше).</P>
          <P>• Тест после урока — +{XP.quizAnswer} за каждый верный ответ.</P>
          <P>• Сданное задание — +{XP.homework}.</P>
          <P>• Задание дня — +{XP.quest}.</P>
          <P>• Очное занятие в студии — +{XP.visit} всем навыкам направления.</P>
        </Card>
        <Card>
          <Text style={s.h}>Честные уровни</Text>
          <P>Онлайн можно подняться максимум на один уровень выше того, что подтвердил педагог. Звания «{SKILL_TITLES[4]}» и «{SKILL_TITLES[5]}» дают только по оценке педагога на занятии — так уровень в приложении всегда совпадает с реальным.</P>
        </Card>
        {!state.school.linked && <Hint>Войдите в кабинет студии в профиле — подтянутся посещения и уровни от педагога.</Hint>}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: C.black, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.gold },
  badge: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.bg2, borderWidth: 2, borderColor: C.gold, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 10.5, letterSpacing: 1.8, textTransform: "uppercase", color: C.gold, fontFamily: F.bold },
  title: { fontFamily: F.serif, fontSize: 24, color: "#fff" },
  xp: { fontFamily: F.serifHeavy, fontSize: 26, color: "#fff" },
  xpLbl: { fontSize: 11, color: "rgba(255,255,255,0.65)", fontFamily: F.sans },
  h: { fontFamily: F.serif, fontSize: 17, color: C.text, marginBottom: 6 },
});
