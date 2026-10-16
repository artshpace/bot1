import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import { Card, Field, Hint, Input, Label, P, PrimaryButton, RowLink, Screen, Section } from "../../../components/ui";
import { getCourse } from "../../../lib/courses";
import { openWhatsApp } from "../../../lib/links";
import { POINTS, useProgress } from "../../../lib/progress";
import { lessonXp, XP } from "../../../lib/game";
import { Quiz } from "../../../components/Quiz";
import { SITE_URL } from "../../../config";
import { C, F } from "../../../theme";

/** Видео YouTube. baseUrl нужен, иначе YouTube отказывается играть встроенное видео в приложении. */
function YouTube({ id }: { id: string }) {
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:#000;height:100%}iframe{border:0;width:100%;height:100%}</style></head>
<body><iframe src="https://www.youtube.com/embed/${encodeURIComponent(id)}?rel=0&playsinline=1" allow="encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe></body></html>`;
  return (
    <View style={s.video}>
      <WebView source={{ html, baseUrl: SITE_URL }} allowsFullscreenVideo mediaPlaybackRequiresUserAction={false} style={{ backgroundColor: "#000" }} />
    </View>
  );
}

export default function LessonScreen() {
  const { code, idx: idxStr } = useLocalSearchParams<{ code: string; idx: string }>();
  const idx = Number(idxStr);
  const { state, completeLesson, submitHomework, answerQuiz } = useProgress();
  const course = getCourse(code);
  const les = course?.lessons[idx];
  const key = `${code}:${idx}`;
  const saved = state.homework[key];
  const [hw, setHw] = useState(saved?.text ?? "");
  const [editing, setEditing] = useState(!saved);

  const done = state.courses[code]?.done ?? 0;
  if (!course || !les || idx > done) return null; // закрытый урок не открываем
  const passed = idx < done;
  const quizResult = state.quizzes[key];
  const needQuiz = !!les.quiz?.length && !quizResult;
  const needHw = !!les.boss && !saved;
  const gain = Object.entries(lessonXp(code, idx));

  function sendHw() {
    if (!hw.trim()) return;
    submitHomework(code, idx, hw.trim());
    setEditing(false);
  }

  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        {les.boss && (
          <View style={s.bossBanner}>
            <Text style={s.bossEyebrow}>Финал главы</Text>
            <Text style={s.bossText}>Испытание: выполните задание и сдайте отчёт — опыт за урок удваивается.</Text>
          </View>
        )}
        <Label icon={les.boss ? "trophy" : "play"}>{les.title}</Label>
        {les.yt ? <YouTube id={les.yt} /> : <View style={[s.video, s.ph]}><Text style={s.phText}>Видео урока появится здесь</Text></View>}
        {les.desc ? <P style={{ fontSize: 14, marginTop: 14, marginHorizontal: 2 }}>{les.desc}</P> : null}

        <Label icon="info" style={{ marginTop: 20 }}>Теория</Label>
        <Card><P>{les.theory || "Теория появится здесь."}</P></Card>

        {les.cards?.length ? <>
          <Label icon="spark" style={{ marginTop: 20 }}>Ключевые понятия</Label>
          <Card>
            {les.cards.map((k, i) => (
              <View key={i} style={{ marginBottom: i < les.cards!.length - 1 ? 10 : 0 }}>
                <Text style={s.term}>{k.front}</Text>
                <P>{k.back}</P>
              </View>
            ))}
          </Card>
          <Hint style={{ marginTop: -4 }}>Они попадут в тренировку карточками на странице курса.</Hint>
        </> : null}

        <Label icon="doc" style={{ marginTop: 20 }}>Практика и домашнее задание</Label>
        <Card><P>{les.practice || "Задание появится здесь."}</P></Card>

        {editing ? (
          <Field label="Мой отчёт о выполнении">
            <Input value={hw} onChangeText={setHw} multiline placeholder="Напишите, что сделали, что получилось, что было сложно…" style={{ minHeight: 96, textAlignVertical: "top" }} />
            <PrimaryButton title="Сдать задание" disabled={!hw.trim()} onPress={sendHw} color={C.black} style={{ marginTop: 10 }} />
            <Hint>За первое сданное задание урока: +{POINTS.homework} баллов и +{XP.homework} опыта.</Hint>
          </Field>
        ) : (
          <Card style={{ borderColor: C.green }}>
            <Text style={s.hwTitle}>✓ Задание сдано</Text>
            <P>{saved?.text}</P>
            <Text style={s.edit} onPress={() => setEditing(true)}>Изменить</Text>
          </Card>
        )}
        <RowLink icon="wa" iconColor={C.wa} title="Отправить видео/фото педагогу в WhatsApp"
          onPress={() => openWhatsApp(`Здравствуйте! Домашнее задание: ${course.title}, ${les.title}.${hw.trim() ? "\n" + hw.trim() : ""}`)} />

        {les.quiz?.length ? <>
          <Label icon="help" style={{ marginTop: 20 }}>Проверь себя</Label>
          <Quiz questions={les.quiz} result={quizResult} onSubmit={(c) => answerQuiz(code, idx, c, les.quiz!.length)} />
        </> : null}

        {gain.length > 0 && (
          <View style={s.reward}>
            <Text style={s.rewardTitle}>Награда за урок</Text>
            {gain.map(([k, v]) => <Text key={k} style={s.rewardLine}>+{v} опыта · {k.split("|")[1]}</Text>)}
          </View>
        )}

        {passed ? (
          <Hint center style={{ marginTop: 10 }}>Урок уже пройден.</Hint>
        ) : (
          <>
            <PrimaryButton title={les.boss ? "Пройти испытание" : "Выполнено"} disabled={needQuiz || needHw} style={{ marginTop: 10 }} onPress={() => { completeLesson(code, idx); router.back(); }} />
            <Hint center style={{ marginTop: 10 }}>
              {needQuiz ? "Сначала ответьте на вопросы теста." : needHw ? "Для финала главы нужно сдать отчёт о задании." : `Посмотрите видео, выполните задание и нажмите «${les.boss ? "Пройти испытание" : "Выполнено"}». +${POINTS.lesson} баллов`}
            </Hint>
          </>
        )}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  video: { width: "100%", aspectRatio: 16 / 9, borderRadius: 14, overflow: "hidden", backgroundColor: "#000" },
  ph: { backgroundColor: C.bg2, borderWidth: 2, borderStyle: "dashed", borderColor: C.hair, alignItems: "center", justifyContent: "center" },
  phText: { color: C.hint, fontSize: 13, fontFamily: F.sans },
  hwTitle: { fontFamily: F.bold, color: C.green, fontSize: 14, marginBottom: 6 },
  edit: { color: C.red, fontFamily: F.semi, fontSize: 13, marginTop: 8 },
  term: { fontFamily: F.bold, fontSize: 14.5, color: C.text, marginBottom: 2 },
  bossBanner: { backgroundColor: C.black, borderRadius: 14, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: C.gold },
  bossEyebrow: { fontSize: 10.5, letterSpacing: 1.8, textTransform: "uppercase", color: C.gold, fontFamily: F.bold },
  bossText: { color: "#fff", fontFamily: F.sans, fontSize: 13.5, marginTop: 4, lineHeight: 19 },
  reward: { marginTop: 16, backgroundColor: C.paper, borderWidth: 1, borderColor: C.hair, borderRadius: 14, padding: 14 },
  rewardTitle: { fontFamily: F.bold, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: C.goldDark, marginBottom: 4 },
  rewardLine: { fontFamily: F.semi, fontSize: 14, color: C.text, marginTop: 2 },
});
