import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Card, Field, Hint, Input, Label, P, PrimaryButton, Screen, Section } from "../../../components/ui";
import { AdminOnly } from "../../../components/AdminOnly";
import type { QuizQuestion } from "../../../data/content";
import { getCourseFull, getLesson, saveLesson, youtubeId, type AdminLesson } from "../../../lib/adminApi";
import { useCourses } from "../../../lib/courses";
import { SKILLS } from "../../../lib/game";
import { C, F } from "../../../theme";

/** Карточки в текстовом виде: «термин — определение» на строке. */
const cardsToText = (cards: { front: string; back: string }[] = []) => cards.map((c) => `${c.front} — ${c.back}`).join("\n");
const textToCards = (t: string) => t.split("\n").map((line) => {
  const m = line.split(/\s+[—–-]\s+/);
  return m.length >= 2 ? { front: m[0].trim(), back: m.slice(1).join(" — ").trim() } : null;
}).filter((x): x is { front: string; back: string } => !!x && !!x.front && !!x.back);

export default function AdminLessonScreen() {
  const { id, course, sort } = useLocalSearchParams<{ id: string; course: string; sort?: string }>();
  const isNew = id === "new";
  const { refresh } = useCourses();
  const [l, setL] = useState<AdminLesson | null>(isNew ? { course_id: course, sort: Number(sort ?? 0), title: "", free: false, content: {} } : null);
  const [dir, setDir] = useState<keyof typeof SKILLS | null>(null);
  const [ytText, setYtText] = useState("");
  const [cardsText, setCardsText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCourseFull(course).then(({ course: c }) => setDir(c.direction)).catch(() => {});
    if (!isNew) getLesson(id).then((x) => { setL(x); setYtText(x.content.yt ?? ""); setCardsText(cardsToText(x.content.cards)); }).catch((e) => Alert.alert("Ошибка", e.message));
  }, [id]);

  if (!l) return <AdminOnly><Screen><ActivityIndicator color={C.red} style={{ marginTop: 40 }} /></Screen></AdminOnly>;
  const ct = l.content;
  const setC = (patch: Partial<AdminLesson["content"]>) => setL({ ...l, content: { ...ct, ...patch } });
  const quiz = ct.quiz ?? [];
  const setQ = (i: number, patch: Partial<QuizQuestion>) => setC({ quiz: quiz.map((q, j) => (j === i ? { ...q, ...patch } : q)) });

  async function save() {
    if (!l!.title.trim()) { Alert.alert("Урок", "Введите название урока"); return; }
    const badQuiz = quiz.findIndex((q) => !q.q.trim() || q.options.filter((o) => o.trim()).length < 2);
    if (badQuiz >= 0) { Alert.alert("Тест", `Вопрос ${badQuiz + 1}: нужен текст и минимум 2 варианта ответа.`); return; }
    setBusy(true);
    try {
      const cleanQuiz = quiz.map((q) => {
        const opts = q.options.map((o) => o.trim());
        const keep = opts.map((o, i) => ({ o, i })).filter((x) => x.o);
        return { q: q.q.trim(), options: keep.map((x) => x.o), correct: Math.max(0, keep.findIndex((x) => x.i === q.correct)) };
      });
      const sk = Object.fromEntries(Object.entries(ct.skills ?? {}).filter(([, v]) => v > 0));
      const skills = Object.keys(sk).length ? sk : undefined;
      await saveLesson({ ...l!, title: l!.title.trim(), content: { ...ct, yt: youtubeId(ytText), quiz: cleanQuiz, cards: textToCards(cardsText), skills } });
      refresh();
      router.back();
    } catch (e) { Alert.alert("Ошибка", e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <AdminOnly>
      <Screen>
        <Section style={{ paddingTop: 0 }}>
          <Label icon="play">{isNew ? "Новый урок" : "Урок"}</Label>
          <Field label="Название"><Input value={l.title} onChangeText={(v) => setL({ ...l, title: v })} placeholder="Урок 1. Первые аккорды" /></Field>
          <Field label="Видео YouTube (ссылка, доступ «По ссылке»)">
            <Input value={ytText} onChangeText={setYtText} autoCapitalize="none" placeholder="https://youtu.be/…" />
            {ytText ? <Hint>ID ролика: {youtubeId(ytText) || "не распознан"}</Hint> : null}
          </Field>
          <Field label="Коротко об уроке"><Input value={ct.desc ?? ""} onChangeText={(v) => setC({ desc: v })} multiline style={s.area} /></Field>
          <Field label="Теория"><Input value={ct.theory ?? ""} onChangeText={(v) => setC({ theory: v })} multiline style={[s.area, { minHeight: 140 }]} /></Field>
          <Field label="Практика и домашнее задание"><Input value={ct.practice ?? ""} onChangeText={(v) => setC({ practice: v })} multiline style={s.area} /></Field>

          <Card>
            <Row title="Пробный урок" sub="Открыт всем без кода — для знакомства с курсом" value={l.free} onChange={(v) => setL({ ...l, free: v })} />
            <Row title="Финал главы («босс»)" sub="Нужен отчёт о задании, опыт ×2" value={!!ct.boss} onChange={(v) => setC({ boss: v })} />
          </Card>

          <Label icon="star" style={{ marginTop: 18 }}>Опыт навыкам</Label>
          {dir ? SKILLS[dir].map((sk) => (
            <View key={sk} style={s.skill}>
              <Text style={s.skillName}>{sk}</Text>
              <Input value={ct.skills?.[sk] ? String(ct.skills[sk]) : ""} onChangeText={(v) => setC({ skills: { ...ct.skills, [sk]: Number(v.replace(/\D/g, "")) || 0 } })}
                keyboardType="number-pad" placeholder="0" style={{ width: 80, textAlign: "center", padding: 10 }} />
            </View>
          )) : <Hint>Выберите направление курса, чтобы назначить опыт навыкам.</Hint>}
          <Hint>Обычно 10–30 опыта за урок. Если не указать — 15 в первый навык направления.</Hint>

          <Label icon="help" style={{ marginTop: 18 }}>Тест после урока</Label>
          {quiz.map((q, i) => (
            <Card key={i}>
              <Field label={`Вопрос ${i + 1}`}><Input value={q.q} onChangeText={(v) => setQ(i, { q: v })} /></Field>
              {[0, 1, 2, 3].map((oi) => (
                <View key={oi} style={s.opt}>
                  <Pressable onPress={() => setQ(i, { correct: oi })} style={[s.radio, q.correct === oi && { borderColor: C.green, backgroundColor: C.green }]} hitSlop={6}>
                    {q.correct === oi && <Text style={{ color: "#fff", fontSize: 11 }}>✓</Text>}
                  </Pressable>
                  <Input value={q.options[oi] ?? ""} onChangeText={(v) => { const o = [...q.options]; o[oi] = v; setQ(i, { options: o }); }}
                    placeholder={`Вариант ${oi + 1}${oi > 1 ? " (необязательно)" : ""}`} style={{ flex: 1, padding: 10 }} />
                </View>
              ))}
              <Hint>Зелёная отметка — правильный ответ.</Hint>
              <Text style={s.del} onPress={() => setC({ quiz: quiz.filter((_, j) => j !== i) })}>Удалить вопрос</Text>
            </Card>
          ))}
          <PrimaryButton title="+ Добавить вопрос" color={C.black} onPress={() => setC({ quiz: [...quiz, { q: "", options: ["", "", ""], correct: 0 }] })} />

          <Label icon="spark" style={{ marginTop: 18 }}>Карточки для повторения</Label>
          <Field label="Каждая карточка с новой строки: «термин — определение»">
            <Input value={cardsText} onChangeText={setCardsText} multiline style={[s.area, { minHeight: 120 }]}
              placeholder={"Am — ля минор: аккорд из трёх пальцев\nБой «шестёрка» — вниз, вниз, вверх, вверх, вниз, вверх"} />
            <Hint>Распознано карточек: {textToCards(cardsText).length}</Hint>
          </Field>

          <PrimaryButton title={busy ? "Сохраняем…" : "Сохранить урок"} disabled={busy} onPress={save} style={{ marginTop: 10 }} />
          <P style={{ marginTop: 10, textAlign: "center" }}>Ученики увидят изменения при следующем открытии приложения.</P>
        </Section>
      </Screen>
    </AdminOnly>
  );
}

function Row({ title, sub, value, onChange }: { title: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.text }}>{title}</Text>
        <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.hint }}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.red, false: C.bg3 }} thumbColor="#fff" />
    </View>
  );
}

const s = StyleSheet.create({
  area: { minHeight: 90, textAlignVertical: "top" },
  skill: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  skillName: { flex: 1, fontFamily: F.semi, fontSize: 14, color: C.text },
  opt: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.hair, alignItems: "center", justifyContent: "center" },
  del: { color: C.red, fontFamily: F.semi, fontSize: 13, marginTop: 6 },
});
