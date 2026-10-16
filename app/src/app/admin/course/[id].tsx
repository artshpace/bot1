import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Card, Chip, Field, Hint, Input, Label, P, PrimaryButton, Screen, Section } from "../../../components/ui";
import { Icon } from "../../../components/Icon";
import { AdminOnly } from "../../../components/AdminOnly";
import { DATA, ORDER, type CourseAward } from "../../../data/content";
import {
  createCode, deleteCode, deleteCourse, deleteLesson, emptyCourse, getCourseFull, listCodes, reorderLessons, saveCourse,
  type AdminCourse, type AdminLesson, type CourseCode,
} from "../../../lib/adminApi";
import { useCourses } from "../../../lib/courses";
import { C, F } from "../../../theme";

const RULES: { type: CourseAward["rule"]["type"]; label: string; n?: boolean }[] = [
  { type: "lessons", label: "Пройти N уроков", n: true },
  { type: "complete", label: "Пройти весь курс" },
  { type: "quiz_perfect", label: "Все тесты без ошибок" },
  { type: "boss", label: "Финал главы" },
  { type: "homework", label: "Сдать N заданий", n: true },
  { type: "cards", label: "Выучить N карточек", n: true },
];
const ICONS = ["trophy", "star", "spark", "flame", "check", "doc", "play"];

export default function AdminCourse() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const { refresh } = useCourses();
  const [c, setC] = useState<AdminCourse | null>(isNew ? emptyCourse() : null);
  const [lessons, setLessons] = useState<AdminLesson[]>([]);
  const [codes, setCodes] = useState<CourseCode[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (isNew) return;
    getCourseFull(id).then(({ course, lessons }) => { setC(course); setLessons(lessons); }).catch((e) => setErr(e.message));
    listCodes(id).then(setCodes).catch(() => {});
  }, [id]);
  useFocusEffect(load);

  if (!c) return <AdminOnly><Screen><Section style={{ paddingTop: 0 }}>{err ? <Card><P>{err}</P></Card> : <ActivityIndicator color={C.red} />}</Section></Screen></AdminOnly>;
  const set = (patch: Partial<AdminCourse>) => setC({ ...c, ...patch });
  const setAward = (i: number, patch: Partial<CourseAward>) => set({ awards: c.awards.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  async function save(publish?: boolean) {
    if (!c!.title.trim()) { Alert.alert("Курс", "Введите название курса"); return; }
    setBusy(true); setErr(null);
    try {
      const newId = await saveCourse({ ...c!, awards: c!.awards.filter((a) => a.title.trim()), outcomes: c!.outcomes.map((o) => o.trim()).filter(Boolean), published: publish ?? c!.published });
      refresh();
      if (isNew) router.replace(`/admin/course/${newId}`);
      else { set({ published: publish ?? c!.published }); Alert.alert("Сохранено", publish === undefined ? "Изменения сохранены." : publish ? "Курс опубликован — ученики видят его в каталоге." : "Курс снят с публикации."); }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function move(i: number, d: -1 | 1) {
    const arr = [...lessons]; const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setLessons(arr);
    await reorderLessons(arr.map((l) => l.id!));
  }

  return (
    <AdminOnly>
      <Screen>
        <Section style={{ paddingTop: 0 }}>
          <Label icon="doc">{isNew ? "Новый курс" : "Курс"}</Label>
          {err && <Card style={{ borderColor: C.red }}><P>{err}</P></Card>}
          <Field label="Название"><Input value={c.title} onChangeText={(v) => set({ title: v })} placeholder="Например: Гитара с нуля" /></Field>
          <Field label="Направление (дерево навыков)">
            <View style={s.chips}>
              {ORDER.map((d) => <Chip key={d} title={DATA[d].title} on={c.direction === d} onPress={() => set({ direction: d })} />)}
            </View>
          </Field>
          <Field label="Коротко (для карточки каталога)"><Input value={c.summary} onChangeText={(v) => set({ summary: v })} placeholder="Одна строка о курсе" /></Field>
          <Field label="Описание"><Input value={c.description} onChangeText={(v) => set({ description: v })} multiline style={s.area} placeholder="Для кого курс, как проходит, что внутри" /></Field>
          <Field label="Чему научатся (каждый пункт с новой строки)">
            <Input value={c.outcomes.join("\n")} onChangeText={(v) => set({ outcomes: v.split("\n") })} multiline style={s.area} placeholder={"Играть 5 аккордов\nДержать ритм\nСыграть первую песню"} />
          </Field>
          <Field label="Обложка (ссылка на картинку, например из Медиацентра сайта)"><Input value={c.cover_url} onChangeText={(v) => set({ cover_url: v.trim() })} autoCapitalize="none" placeholder="https://…" /></Field>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label="Цена, ₸ (пусто — бесплатно)"><Input value={c.price ? String(c.price) : ""} onChangeText={(v) => set({ price: v.replace(/\D/g, "") ? Number(v.replace(/\D/g, "")) : null })} keyboardType="number-pad" placeholder="15000" /></Field>
            </View>
          </View>
          <Field label="Ссылка на оплату (Kaspi Pay / счёт)"><Input value={c.pay_url} onChangeText={(v) => set({ pay_url: v.trim() })} autoCapitalize="none" placeholder="https://pay.kaspi.kz/…" /></Field>
          <PrimaryButton title={busy ? "Сохраняем…" : isNew ? "Создать курс" : "Сохранить"} disabled={busy} onPress={() => save()} />
        </Section>

        {!isNew && <>
          <Section>
            <Label icon="play">Уроки ({lessons.length})</Label>
            {lessons.map((l, i) => (
              <View key={l.id} style={s.lesson}>
                <Text style={s.num}>{i + 1}</Text>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/admin/lesson/${l.id}?course=${id}`)}>
                  <Text style={s.lessonTitle}>{l.title}</Text>
                  <Text style={s.lessonSub}>
                    {[l.content.yt ? "видео" : "без видео", l.content.quiz?.length ? `тест ${l.content.quiz.length}` : null, l.content.cards?.length ? `карточек ${l.content.cards.length}` : null, l.content.boss ? "финал" : null, l.free ? "бесплатный" : null].filter(Boolean).join(" · ")}
                  </Text>
                </Pressable>
                <Pressable onPress={() => move(i, -1)} hitSlop={8}><Icon name="chevd" size={18} color={C.hint} /></Pressable>
                <Pressable onPress={() => move(i, 1)} hitSlop={8} style={{ transform: [{ rotate: "180deg" }] }}><Icon name="chevd" size={18} color={C.hint} /></Pressable>
                <Pressable hitSlop={8} onPress={() => Alert.alert("Удалить урок?", l.title, [{ text: "Отмена", style: "cancel" }, { text: "Удалить", style: "destructive", onPress: async () => { await deleteLesson(l.id!); load(); } }])}>
                  <Text style={s.del}>✕</Text>
                </Pressable>
              </View>
            ))}
            <PrimaryButton title="+ Добавить урок" color={C.black} onPress={() => router.push(`/admin/lesson/new?course=${id}&sort=${lessons.length}`)} style={{ marginTop: 8 }} />
          </Section>

          <Section>
            <Label icon="trophy">Награды курса</Label>
            {c.awards.map((a, i) => (
              <Card key={a.id}>
                <Field label="Название"><Input value={a.title} onChangeText={(v) => setAward(i, { title: v })} /></Field>
                <Field label="Описание"><Input value={a.desc} onChangeText={(v) => setAward(i, { desc: v })} /></Field>
                <Field label="Условие">
                  <View style={s.chips}>{RULES.map((r) => <Chip key={r.type} title={r.label} on={a.rule.type === r.type} onPress={() => setAward(i, { rule: { type: r.type, n: r.n ? a.rule.n ?? 3 : undefined } })} />)}</View>
                </Field>
                {RULES.find((r) => r.type === a.rule.type)?.n && (
                  <Field label="N"><Input value={String(a.rule.n ?? "")} onChangeText={(v) => setAward(i, { rule: { ...a.rule, n: Number(v.replace(/\D/g, "")) || 1 } })} keyboardType="number-pad" /></Field>
                )}
                <Field label="Значок">
                  <View style={s.chips}>{ICONS.map((ic) => (
                    <Pressable key={ic} onPress={() => setAward(i, { icon: ic })} style={[s.icon, a.icon === ic && { borderColor: C.gold, backgroundColor: C.black }]}>
                      <Icon name={ic} size={20} color={a.icon === ic ? C.gold : C.hint} />
                    </Pressable>
                  ))}</View>
                </Field>
                <Text style={s.del} onPress={() => set({ awards: c.awards.filter((_, j) => j !== i) })}>Удалить награду</Text>
              </Card>
            ))}
            <PrimaryButton title="+ Добавить награду" color={C.black}
              onPress={() => set({ awards: [...c.awards, { id: `a${Date.now().toString(36)}`, title: "", desc: "", icon: "trophy", rule: { type: "complete" } }] })} />
            <Hint>После изменения наград нажмите «Сохранить» вверху.</Hint>
          </Section>

          <Section>
            <Label icon="lock">Коды доступа</Label>
            <Hint style={{ marginTop: -8, marginBottom: 10 }}>Создайте код после оплаты и отправьте ученику. Один код — один ученик.</Hint>
            <Field label="Кому (для себя)"><Input value={note} onChangeText={setNote} placeholder="Иванов Иван, оплата 12.10" /></Field>
            <PrimaryButton title="Создать код" color={C.black} onPress={async () => {
              try { const code = await createCode(id, note); setNote(""); await Clipboard.setStringAsync(code); Alert.alert("Код создан", `${code}\n\nСкопирован — отправьте ученику.`); listCodes(id).then(setCodes); }
              catch (e) { Alert.alert("Ошибка", e instanceof Error ? e.message : String(e)); }
            }} />
            {codes.map((k) => (
              <View key={k.code} style={s.code}>
                <Pressable style={{ flex: 1 }} onPress={() => Clipboard.setStringAsync(k.code).then(() => Alert.alert("Скопировано", k.code))}>
                  <Text style={s.codeText}>{k.code}</Text>
                  <Text style={s.lessonSub}>{k.note || "—"} · {k.used >= k.max_uses ? "использован" : "свободен"}</Text>
                </Pressable>
                <Text style={s.del} onPress={() => deleteCode(k.code).then(() => listCodes(id).then(setCodes))}>✕</Text>
              </View>
            ))}
          </Section>

          <Section>
            <Card style={{ borderColor: c.published ? C.green : C.gold }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.lessonTitle}>{c.published ? "Опубликован" : "Черновик"}</Text>
                  <Text style={s.lessonSub}>{c.published ? "Курс виден ученикам в каталоге" : "Ученики не видят курс"}</Text>
                </View>
                <Switch value={c.published} onValueChange={(v) => save(v)} trackColor={{ true: C.green, false: C.bg3 }} thumbColor="#fff" />
              </View>
            </Card>
            <Text style={[s.del, { textAlign: "center", marginTop: 12 }]} onPress={() => Alert.alert("Удалить курс?", "Удалятся все уроки и коды. Это нельзя отменить.", [
              { text: "Отмена", style: "cancel" },
              { text: "Удалить", style: "destructive", onPress: async () => { await deleteCourse(id); refresh(); router.back(); } },
            ])}>Удалить курс</Text>
          </Section>
        </>}
      </Screen>
    </AdminOnly>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  area: { minHeight: 90, textAlignVertical: "top" },
  lesson: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: C.sep, backgroundColor: C.bg2, borderRadius: 12, padding: 12, marginBottom: 8 },
  num: { width: 20, fontFamily: F.serif, fontSize: 15, color: C.goldDark },
  lessonTitle: { fontFamily: F.bold, fontSize: 14, color: C.text },
  lessonSub: { fontFamily: F.sans, fontSize: 11.5, color: C.hint, marginTop: 2 },
  del: { color: C.red, fontFamily: F.semi, fontSize: 13, paddingHorizontal: 4 },
  icon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: C.sep, alignItems: "center", justifyContent: "center" },
  code: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: C.hair, paddingVertical: 10 },
  codeText: { fontFamily: F.bold, fontSize: 16, letterSpacing: 2, color: C.text },
});
