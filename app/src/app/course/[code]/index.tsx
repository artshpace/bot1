import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { Hint, Label, Screen, Section } from "../../../components/ui";
import { CourseProgress } from "../../../components/CourseProgress";
import { useCourses } from "../../../lib/courses";
import { Icon } from "../../../components/Icon";
import { DATA } from "../../../data/content";
import { getCourse } from "../../../lib/courses";
import { lessonXp } from "../../../lib/game";
import { useProgress } from "../../../lib/progress";
import { C, F } from "../../../theme";

const ROW = 118;          // высота шага на карте
const NODE = 64;          // диаметр точки урока
const BOSS = 84;
const X = [0.5, 0.78, 0.5, 0.22]; // змейка: центр → право → центр → лево

/** Курс как карта-квест: уроки — точки на пути, в конце главы — «босс». */
export default function CourseScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  useCourses(); // перерисовать после загрузки курсов
  const course = getCourse(code);
  const { state } = useProgress();
  const [w, setW] = useState(0);
  if (!course) return null;
  const total = course.lessons.length;
  const done = Math.min(state.courses[code]?.done ?? 0, total);
  const pts = course.lessons.map((_, i) => ({ x: X[i % X.length] * w, y: i * ROW + BOSS / 2 }));
  const path = pts.map((p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const q = pts[i - 1];
    const my = (q.y + p.y) / 2;
    return `C ${q.x} ${my}, ${p.x} ${my}, ${p.x} ${p.y}`;
  }).join(" ");
  const donePath = pts.slice(0, done + 1).map((p, i, arr) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const q = arr[i - 1]; const my = (q.y + p.y) / 2;
    return `C ${q.x} ${my}, ${p.x} ${my}, ${p.x} ${p.y}`;
  }).join(" ");

  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <Label icon={course.direction ? DATA[course.direction].icon : "laptop"}>{course.title}</Label>
        <CourseProgress code={code} />
        <Text style={s.mapTitle}>Карта курса</Text>
        {!course.enrolled && <Hint style={{ marginTop: -6, marginBottom: 12 }}>Открыт пробный урок. Остальные откроются после оплаты курса.</Hint>}

        <View style={{ height: (total - 1) * ROW + BOSS + 40 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          {w > 0 && (
            <Svg width={w} height={(total - 1) * ROW + BOSS} style={StyleSheet.absoluteFill}>
              <Path d={path} stroke={C.hair} strokeWidth={6} strokeDasharray="2 12" strokeLinecap="round" fill="none" />
              {done > 0 && <Path d={donePath} stroke={C.gold} strokeWidth={6} strokeLinecap="round" fill="none" />}
            </Svg>
          )}
          {w > 0 && course.lessons.map((les, i) => {
            const st = i < done ? "done" : i === done ? "now" : "locked";
            const size = les.boss ? BOSS : NODE;
            const xp = Object.values(lessonXp(code, i)).reduce((a, b) => a + b, 0);
            const left = Math.min(Math.max(pts[i].x - size / 2, 0), w - size);
            const labelLeft = pts[i].x > w / 2;
            return (
              <View key={i} style={{ position: "absolute", top: pts[i].y - size / 2, left: 0, right: 0, height: size }}>
                <Pressable
                  disabled={st === "locked"}
                  onPress={() => router.push(`/course/${code}/${i}`)}
                  style={({ pressed }) => [
                    s.node, { width: size, height: size, borderRadius: size / 2, left },
                    st === "done" && s.nodeDone, st === "now" && s.nodeNow, les.boss && s.nodeBoss,
                    pressed && { transform: [{ scale: 0.94 }] },
                  ]}
                >
                  {st === "done" ? <Icon name="check" size={26} color="#fff" strokeWidth={2.6} />
                    : les.boss ? <Icon name={st === "locked" ? "lock" : "trophy"} size={32} color={C.gold} strokeWidth={1.9} />
                    : st === "locked" ? <Icon name="lock" size={22} color={C.hint} />
                    : <Text style={s.num}>{i + 1}</Text>}
                </Pressable>
                <Pressable disabled={st === "locked"} onPress={() => router.push(`/course/${code}/${i}`)}
                  style={[s.label, labelLeft ? { left: 0, right: w - left + 10, alignItems: "flex-end" } : { left: left + size + 10, right: 0 }]}>
                  {les.boss && <Text style={s.boss}>Финал главы</Text>}
                  <Text style={[s.title, st === "locked" && { color: C.hint }, labelLeft && { textAlign: "right" }]} numberOfLines={2}>{les.title}</Text>
                  <Text style={s.xp}>{st === "done" ? "✓ пройдено" : `+${xp} опыта${les.quiz?.length ? " · тест" : ""}`}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
        {done >= total && <Hint center>Глава пройдена! Награды — в профиле, навыки — во вкладке «Обучение».</Hint>}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  mapTitle: { fontFamily: F.serif, fontSize: 17, color: C.text, marginTop: 14, marginBottom: 14 },
  node: { position: "absolute", top: 0, alignItems: "center", justifyContent: "center", backgroundColor: C.bg3, borderWidth: 3, borderColor: C.bg },
  nodeDone: { backgroundColor: C.green },
  nodeNow: { backgroundColor: C.red, borderColor: "rgba(227,6,19,0.25)", borderWidth: 6, shadowColor: C.red, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  nodeBoss: { backgroundColor: C.black, borderColor: C.gold, borderWidth: 3 },
  num: { color: "#fff", fontFamily: F.serifHeavy, fontSize: 24 },
  label: { position: "absolute", top: -6, bottom: -6, justifyContent: "center" },
  boss: { fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: C.red, fontFamily: F.bold },
  title: { fontFamily: F.bold, fontSize: 13.5, color: C.text },
  xp: { fontFamily: F.semi, fontSize: 11.5, color: C.goldDark, marginTop: 2 },
});
