import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import Svg, { Circle } from "react-native-svg";
import { DATA } from "../data/content";
import type { CourseInfo } from "../lib/courses";
import { lessonsWord, todayKey } from "../lib/game";
import { courseStats, useProgress } from "../lib/progress";
import { C, F } from "../theme";
import { Icon } from "./Icon";
import { Chip, ProgressBar } from "./ui";

export const fmtPrice = (p?: number | null) => (p ? `${p.toLocaleString("ru-RU").replace(/,/g, " ")} ₸` : "Бесплатно");

/** Кольцо прогресса. */
export function Ring({ value, size = 64, stroke = 7, color = C.gold, track = C.bg3, children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - Math.max(0, Math.min(1, value)))} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      {children}
    </View>
  );
}

/** Дневная цель по опыту — как в Duolingo. */
export function DailyGoal() {
  const { state, setDailyGoal } = useProgress();
  const today = state.xpDays[todayKey()] ?? 0;
  const goal = state.dailyGoal || 30;
  const done = today >= goal;
  return (
    <View style={s.goal}>
      <Ring value={today / goal} color={done ? C.green : C.gold} track="rgba(255,255,255,0.14)">
        <Text style={s.goalNum}>{today}</Text>
      </Ring>
      <View style={{ flex: 1 }}>
        <Text style={s.goalEyebrow}>Цель дня</Text>
        <Text style={s.goalTitle}>{done ? "Цель выполнена! 🎉" : `${today} из ${goal} опыта`}</Text>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
          {[20, 30, 50].map((g) => (
            <Chip key={g} title={`${g}`} on={goal === g} onPress={() => setDailyGoal(g)} style={{ paddingVertical: 4, paddingHorizontal: 10 }} />
          ))}
        </View>
      </View>
    </View>
  );
}

/** Карточка курса: обложка, название, прогресс или цена. */
export function CourseCard({ c }: { c: CourseInfo }) {
  const { state } = useProgress();
  const st = courseStats(state, c.key);
  const started = !!state.courses[c.key];
  const open = c.enrolled;
  return (
    <Pressable onPress={() => router.push(open && started ? `/course/${c.key}` : `/catalog/${c.key}`)} style={({ pressed }) => [s.card, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={s.cover}>
        {c.cover ? <Image source={{ uri: c.cover }} contentFit="cover" style={StyleSheet.absoluteFill} /> : (
          <View style={s.coverPh}><Icon name={c.direction ? DATA[c.direction].icon : "laptop"} size={40} /></View>
        )}
        {st.complete && <View style={s.badge}><Icon name="trophy" size={14} color={C.black} /><Text style={s.badgeText}>Пройден</Text></View>}
      </View>
      <View style={{ padding: 14 }}>
        <Text style={s.dir}>{c.direction ? DATA[c.direction].title : "Онлайн-курс"} · {lessonsWord(st.total || c.outline.length)}</Text>
        <Text style={s.title}>{c.title}</Text>
        {c.summary ? <Text style={s.summary} numberOfLines={2}>{c.summary}</Text> : null}
        {open && started ? (
          <View style={{ marginTop: 10 }}>
            <ProgressBar value={st.pct} color={st.complete ? C.green : C.red} />
            <Text style={s.meta}>{Math.round(st.pct * 100)}% · {st.done} из {st.total}{st.cardsDue ? ` · карточек к повтору: ${st.cardsDue}` : ""}</Text>
          </View>
        ) : (
          <Text style={[s.price, open && { color: C.green }]}>{open ? "Доступ открыт — начать" : fmtPrice(c.price)}</Text>
        )}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  goal: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.black, borderRadius: 16, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: C.gold },
  goalNum: { color: "#fff", fontFamily: F.serifHeavy, fontSize: 18 },
  goalEyebrow: { fontSize: 10.5, letterSpacing: 1.8, textTransform: "uppercase", color: C.gold, fontFamily: F.bold },
  goalTitle: { color: "#fff", fontFamily: F.serif, fontSize: 17, marginTop: 2 },
  card: { borderWidth: 1, borderColor: C.hair, borderRadius: 16, backgroundColor: C.bg2, marginBottom: 12, overflow: "hidden" },
  cover: { height: 120, backgroundColor: C.black },
  coverPh: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#241c14" },
  badge: { position: "absolute", top: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.gold, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontFamily: F.bold, fontSize: 11, color: C.black },
  dir: { fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.red, fontFamily: F.bold },
  title: { fontFamily: F.serif, fontSize: 18, color: C.text, marginTop: 4 },
  summary: { fontFamily: F.sans, fontSize: 13, color: C.hint, marginTop: 4, lineHeight: 18 },
  meta: { fontFamily: F.sans, fontSize: 12, color: C.hint, marginTop: 6 },
  price: { fontFamily: F.serifHeavy, fontSize: 18, color: C.text, marginTop: 10 },
});
