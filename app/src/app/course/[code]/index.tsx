import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Hint, Label, ProgressBar, Screen, Section } from "../../../components/ui";
import { Icon } from "../../../components/Icon";
import { COURSES } from "../../../data/content";
import { useProgress } from "../../../lib/progress";
import { C, F } from "../../../theme";

export default function CourseScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const course = COURSES[code];
  const { state } = useProgress();
  if (!course) return null;
  const total = course.lessons.length;
  const done = Math.min(state.courses[code]?.done ?? 0, total);

  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <Label icon="laptop">{course.title}</Label>
        <ProgressBar value={done / total} />
        <Hint style={{ marginBottom: 16 }}>Пройдено {done} из {total}</Hint>
        {course.lessons.map((les, i) => {
          const state_ = i < done ? "done" : i === done ? "available" : "locked";
          const hw = state.homework[`${code}:${i}`];
          return (
            <Pressable
              key={i}
              disabled={state_ === "locked"}
              onPress={() => router.push(`/course/${code}/${i}`)}
              style={({ pressed }) => [s.row, state_ === "available" && { borderColor: C.gold }, state_ === "locked" && { opacity: 0.55 }, pressed && { transform: [{ scale: 0.98 }] }]}
            >
              <View style={[s.num, state_ === "available" && { backgroundColor: C.red }, state_ === "done" && { backgroundColor: C.green }]}>
                {state_ === "done" ? <Icon name="check" size={16} color="#fff" strokeWidth={2.4} /> : <Text style={[s.numText, state_ === "available" && { color: "#fff" }]}>{i + 1}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{les.title}</Text>
                <Text style={s.st}>
                  {state_ === "done" ? "Пройдено" : state_ === "available" ? "Доступен сейчас" : "Откроется позже"}
                  {hw ? " · ДЗ сдано" : ""}
                </Text>
              </View>
              {state_ === "locked" && <Icon name="lock" size={18} color={C.hint} />}
            </Pressable>
          );
        })}
        {done >= total && <Hint center style={{ marginTop: 8 }}>Курс пройден! Награда «Выпускник» — в вашем профиле.</Hint>}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 13, borderWidth: 1, borderColor: C.hair, borderRadius: 14, padding: 15, marginBottom: 10, backgroundColor: C.bg2 },
  num: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: C.bg3 },
  numText: { fontFamily: F.bold, fontSize: 13, color: C.hint },
  title: { fontFamily: F.bold, fontSize: 14.5, color: C.text },
  st: { fontSize: 12, color: C.hint, fontFamily: F.sans, marginTop: 2 },
});
