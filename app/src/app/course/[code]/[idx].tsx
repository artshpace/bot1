import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import { Card, Field, Hint, Input, Label, P, PrimaryButton, RowLink, Screen, Section } from "../../../components/ui";
import { COURSES } from "../../../data/content";
import { openWhatsApp } from "../../../lib/links";
import { POINTS, useProgress } from "../../../lib/progress";
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
  const { state, completeLesson, submitHomework } = useProgress();
  const course = COURSES[code];
  const les = course?.lessons[idx];
  const key = `${code}:${idx}`;
  const saved = state.homework[key];
  const [hw, setHw] = useState(saved?.text ?? "");
  const [editing, setEditing] = useState(!saved);

  const done = state.courses[code]?.done ?? 0;
  if (!course || !les || idx > done) return null; // закрытый урок не открываем
  const passed = idx < done;

  function sendHw() {
    if (!hw.trim()) return;
    submitHomework(code, idx, hw.trim());
    setEditing(false);
  }

  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <Label icon="play">{les.title}</Label>
        {les.yt ? <YouTube id={les.yt} /> : <View style={[s.video, s.ph]}><Text style={s.phText}>Видео урока появится здесь</Text></View>}
        {les.desc ? <P style={{ fontSize: 14, marginTop: 14, marginHorizontal: 2 }}>{les.desc}</P> : null}

        <Label icon="info" style={{ marginTop: 20 }}>Теория</Label>
        <Card><P>{les.theory || "Теория появится здесь."}</P></Card>

        <Label icon="doc" style={{ marginTop: 20 }}>Практика и домашнее задание</Label>
        <Card><P>{les.practice || "Задание появится здесь."}</P></Card>

        {editing ? (
          <Field label="Мой отчёт о выполнении">
            <Input value={hw} onChangeText={setHw} multiline placeholder="Напишите, что сделали, что получилось, что было сложно…" style={{ minHeight: 96, textAlignVertical: "top" }} />
            <PrimaryButton title="Сдать задание" disabled={!hw.trim()} onPress={sendHw} color={C.black} style={{ marginTop: 10 }} />
            <Hint>За первое сданное задание урока: +{POINTS.homework} баллов.</Hint>
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

        {passed ? (
          <Hint center style={{ marginTop: 10 }}>Урок уже пройден.</Hint>
        ) : (
          <>
            <PrimaryButton title="Выполнено" style={{ marginTop: 10 }} onPress={() => { completeLesson(code, idx); router.back(); }} />
            <Hint center style={{ marginTop: 10 }}>Посмотрите видео, выполните задание и нажмите «Выполнено». +{POINTS.lesson} баллов</Hint>
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
});
