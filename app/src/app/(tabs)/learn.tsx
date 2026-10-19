import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { Card, Field, Hint, Input, Label, P, PrimaryButton, RowLink, Screen, Section } from "../../components/ui";
import { DailyQuests, MasteryCards } from "../../components/GameBlocks";
import { CourseCard, DailyGoal } from "../../components/CourseBlocks";
import { useAccount } from "../../lib/account";
import { useCourses } from "../../lib/courses";
import { useProgress } from "../../lib/progress";
import { C } from "../../theme";

export default function Learn() {
  const { state, openCourse } = useProgress();
  const { catalog, redeem, loading, unavailable } = useCourses();
  const { profile, session } = useAccount();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mine = catalog.filter((c) => c.enrolled && (state.courses[c.key] || c.source === "db"));
  const others = catalog.filter((c) => !mine.includes(c));
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

        <Label icon="lock" style={{ marginTop: 22 }}>Уже оплатили?</Label>
        <Field label="Код доступа к курсу" error={err ?? ""} showError={!!err}>
          <Input value={code} onChangeText={(v) => { setCode(v); setErr(null); }} placeholder="Введите код, который мы выдали" autoCapitalize="characters" autoCorrect={false} />
        </Field>
        <PrimaryButton title={busy ? "Проверяем…" : "Открыть курс"} disabled={busy} onPress={open} />
        <Hint center style={{ marginTop: 10 }}>Попробуйте демо-курс: код DEMO</Hint>

        {!session && (
          <Hint center style={{ marginTop: 18 }}>Администратор студии? Войдите в кабинет (Профиль → «Войти в кабинет студии»), чтобы открыть редактор курсов.</Hint>
        )}
        {isAdmin && (
          <View style={{ marginTop: 22 }}>
            {unavailable && (
              <Card style={{ borderColor: C.red }}>
                <P>База курсов не подключена: примените в Supabase файлы 0032, 0033 и 0034 (см. TODO_APPLY.md). После этого здесь появятся курсы и редактор заработает.</P>
              </Card>
            )}
            <RowLink icon="doc" title="Редактор курсов (администратор)" onPress={() => router.push("/admin")} />
          </View>
        )}
      </Section>
    </Screen>
  );
}
