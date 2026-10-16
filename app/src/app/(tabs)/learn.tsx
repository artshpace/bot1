import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { Field, Hint, Input, Label, PrimaryButton, RowLink, Screen, Section } from "../../components/ui";
import { DailyQuests, MasteryCards } from "../../components/GameBlocks";
import { CourseCard, DailyGoal } from "../../components/CourseBlocks";
import { ONLINE } from "../../data/content";
import { useAccount } from "../../lib/account";
import { useCourses } from "../../lib/courses";
import { openWhatsApp } from "../../lib/links";
import { useProgress } from "../../lib/progress";
import { C } from "../../theme";

export default function Learn() {
  const { state, openCourse } = useProgress();
  const { catalog, redeem, loading } = useCourses();
  const { profile } = useAccount();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mine = catalog.filter((c) => c.enrolled && (state.courses[c.key] || c.source === "db"));
  const others = catalog.filter((c) => !mine.includes(c));
  // направления из сайта, по которым курса в каталоге ещё нет — «скоро»
  const soon = ONLINE.filter((o) => !catalog.some((c) => c.title.toLowerCase().includes(o.title.toLowerCase())));
  const isAdmin = profile?.role === "admin" || profile?.role === "director";

  async function open() {
    if (!code.trim()) return;
    setBusy(true); setErr(null);
    try {
      const key = await redeem(code);
      setCode("");
      openCourse(key);
      router.push(`/course/${key}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Неверный код доступа");
    } finally { setBusy(false); }
  }

  return (
    <Screen back={false}>
      <Section style={{ paddingTop: 0 }}>
        <DailyGoal />
        <MasteryCards />
        <DailyQuests />
        <View style={{ height: 22 }} />

        {mine.length > 0 && <>
          <Label icon="laptop">Мои курсы</Label>
          {mine.map((c) => <CourseCard key={c.key} c={c} />)}
          <View style={{ height: 10 }} />
        </>}

        <Label icon="spark">Каталог курсов</Label>
        {loading && !catalog.length && <ActivityIndicator color={C.red} />}
        {others.map((c) => <CourseCard key={c.key} c={c} />)}
        {soon.map((o) => (
          <RowLink key={o.title} icon="laptop" title={`«${o.title}» — скоро. Оставить заявку`}
            onPress={() => openWhatsApp(`Здравствуйте! Хочу на онлайн-курс «${o.title}».${profile?.name ? `\nФИО: ${profile.name}` : ""}${profile?.phone ? `\nТелефон: ${profile.phone}` : ""}`)} />
        ))}

        <Label icon="lock" style={{ marginTop: 22 }}>Уже оплатили?</Label>
        <Field label="Код доступа к курсу" error={err ?? ""} showError={!!err}>
          <Input value={code} onChangeText={(v) => { setCode(v); setErr(null); }} placeholder="Введите код, который мы выдали" autoCapitalize="characters" autoCorrect={false} />
        </Field>
        <PrimaryButton title={busy ? "Проверяем…" : "Открыть курс"} disabled={busy} onPress={open} />
        <Hint center style={{ marginTop: 10 }}>Попробуйте демо-курс: код DEMO</Hint>

        {isAdmin && (
          <View style={{ marginTop: 22 }}>
            <RowLink icon="doc" title="Редактор курсов (администратор)" onPress={() => router.push("/admin")} />
          </View>
        )}
      </Section>
    </Screen>
  );
}
