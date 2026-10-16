import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { QuizQuestion } from "../data/content";
import { XP } from "../lib/game";
import { C, F } from "../theme";
import { Card, Hint, PrimaryButton } from "./ui";

/** Мини-тест после урока. Опыт — за верные ответы первой попытки. */
export function Quiz({ questions, result, onSubmit }: {
  questions: QuizQuestion[];
  result?: { correct: number; total: number };
  onSubmit: (correct: number) => void;
}) {
  const [picked, setPicked] = useState<(number | null)[]>(questions.map(() => null));
  const [checked, setChecked] = useState(!!result);
  const allPicked = picked.every((p) => p != null);
  const correct = picked.filter((p, i) => p === questions[i].correct).length;

  return (
    <Card style={{ borderColor: C.gold }}>
      {questions.map((q, qi) => (
        <View key={qi} style={{ marginBottom: 14 }}>
          <Text style={s.q}>{qi + 1}. {q.q}</Text>
          {q.options.map((o, oi) => {
            const isPicked = picked[qi] === oi;
            const show = checked;
            const good = show && oi === q.correct;
            const bad = show && isPicked && oi !== q.correct;
            return (
              <Pressable key={oi} disabled={checked} onPress={() => setPicked((p) => p.map((v, i) => (i === qi ? oi : v)))}
                style={[s.opt, isPicked && s.optOn, good && s.good, bad && s.bad]}>
                <View style={[s.radio, isPicked && { borderColor: C.red }]}>{isPicked && <View style={s.dot} />}</View>
                <Text style={[s.optText, (good || bad) && { color: "#fff" }]}>{o}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      {result ? (
        <Text style={s.res}>Тест пройден: {result.correct} из {result.total} · +{result.correct * XP.quizAnswer} опыта</Text>
      ) : checked ? (
        <Text style={s.res}>Верно {correct} из {questions.length} · +{correct * XP.quizAnswer} опыта</Text>
      ) : (
        <>
          <PrimaryButton title="Проверить" disabled={!allPicked} color={C.black} onPress={() => { setChecked(true); onSubmit(correct); }} />
          <Hint>+{XP.quizAnswer} опыта за каждый верный ответ. Попытка одна — подумайте!</Hint>
        </>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  q: { fontFamily: F.bold, fontSize: 14.5, color: C.text, marginBottom: 8 },
  opt: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: C.sep, borderRadius: 12, padding: 12, marginBottom: 6, backgroundColor: C.bg },
  optOn: { borderColor: C.red },
  good: { backgroundColor: C.green, borderColor: C.green },
  bad: { backgroundColor: C.red, borderColor: C.red },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.hair, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.red },
  optText: { flex: 1, fontFamily: F.sans, fontSize: 14, color: C.text },
  res: { fontFamily: F.bold, fontSize: 14, color: C.goldDark },
});
