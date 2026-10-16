import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { getCourse } from "../lib/courses";
import { courseAwardId, courseStats, useProgress } from "../lib/progress";
import { C, F } from "../theme";
import { Ring } from "./CourseBlocks";
import { Icon } from "./Icon";

/** Шапка курса: прогресс, статистика, карточки, награды курса, сертификат. */
export function CourseProgress({ code }: { code: string }) {
  const { state } = useProgress();
  const c = getCourse(code);
  if (!c) return null;
  const st = courseStats(state, code);
  const acc = st.quiz.total ? Math.round((st.quiz.correct / st.quiz.total) * 100) : null;

  return (
    <View>
      <View style={s.head}>
        <Ring value={st.pct} size={78} stroke={8} color={st.complete ? C.green : C.red} track="rgba(255,255,255,0.14)">
          <Text style={s.pct}>{Math.round(st.pct * 100)}%</Text>
        </Ring>
        <View style={{ flex: 1, gap: 6 }}>
          <Stat icon="play" label="Уроки" value={`${st.done}/${st.total}`} />
          <Stat icon="check" label="Тесты" value={acc == null ? "—" : `${acc}% верно`} />
          <Stat icon="doc" label="Задания" value={String(st.homework)} />
          {st.cardsTotal > 0 && <Stat icon="spark" label="Карточки" value={`${st.cardsLearned}/${st.cardsTotal} выучено`} />}
        </View>
      </View>

      {st.cardsTotal > 0 && (
        <Pressable onPress={() => router.push(`/train/${code}`)} style={({ pressed }) => [s.train, pressed && { opacity: 0.9 }]}>
          <Icon name="spark" size={22} color={C.gold} />
          <View style={{ flex: 1 }}>
            <Text style={s.trainTitle}>Тренировка карточками</Text>
            <Text style={s.trainSub}>{st.cardsDue ? `К повторению: ${st.cardsDue}` : "Всё повторено — загляните завтра"}</Text>
          </View>
          <Icon name="chev" size={18} color={C.hint} />
        </Pressable>
      )}

      {st.complete && (
        <Pressable onPress={() => router.push(`/certificate/${code}`)} style={({ pressed }) => [s.cert, pressed && { opacity: 0.9 }]}>
          <Icon name="trophy" size={24} color={C.black} />
          <Text style={s.certText}>Получить сертификат</Text>
        </Pressable>
      )}

      {c.awards?.some((a) => a.title) ? (
        <View style={{ marginTop: 6, marginBottom: 6 }}>
          <Text style={s.h}>Награды курса</Text>
          <View style={s.awards}>
            {c.awards.filter((a) => a.title).map((a) => {
              const got = !!state.awards[courseAwardId(code, a.id)];
              return (
                <View key={a.id} style={[s.award, !got && { opacity: 0.45 }]}>
                  <View style={[s.medal, got && { backgroundColor: C.black, borderColor: C.gold }]}>
                    <Icon name={got ? a.icon : "lock"} size={18} color={got ? C.gold : C.hint} />
                  </View>
                  <Text style={s.awTitle} numberOfLines={2}>{a.title}</Text>
                  <Text style={s.awDesc} numberOfLines={2}>{a.desc}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Icon name={icon} size={15} color={C.gold} />
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: C.black, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.gold },
  pct: { color: "#fff", fontFamily: F.serifHeavy, fontSize: 18 },
  statLabel: { flex: 1, color: "rgba(255,255,255,0.65)", fontFamily: F.sans, fontSize: 12.5 },
  statValue: { color: "#fff", fontFamily: F.semi, fontSize: 13 },
  train: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10, backgroundColor: C.bg2, borderWidth: 1, borderColor: C.gold, borderRadius: 14, padding: 14 },
  trainTitle: { fontFamily: F.bold, fontSize: 14.5, color: C.text },
  trainSub: { fontFamily: F.sans, fontSize: 12, color: C.hint, marginTop: 1 },
  cert: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 10, backgroundColor: C.gold, borderRadius: 14, padding: 15 },
  certText: { fontFamily: F.bold, fontSize: 15, color: C.black },
  h: { fontFamily: F.serif, fontSize: 17, color: C.text, marginTop: 14, marginBottom: 8 },
  awards: { flexDirection: "row", gap: 8 },
  award: { flex: 1, alignItems: "center", backgroundColor: C.bg2, borderWidth: 1, borderColor: C.sep, borderRadius: 12, padding: 8 },
  medal: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: C.sep, alignItems: "center", justifyContent: "center", backgroundColor: C.bg3, marginBottom: 6 },
  awTitle: { fontFamily: F.bold, fontSize: 11, color: C.text, textAlign: "center" },
  awDesc: { fontFamily: F.sans, fontSize: 9.5, color: C.hint, textAlign: "center", marginTop: 2 },
});
