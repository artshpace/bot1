import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Card, Hint, Label, P, PrimaryButton, Screen, Section } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { fmtPrice } from "../../components/CourseBlocks";
import { DATA } from "../../data/content";
import { AdminOnly } from "../../components/AdminOnly";
import { listCourses } from "../../lib/adminApi";
import { C, F } from "../../theme";

export default function AdminCourses() {
  const [list, setList] = useState<Awaited<ReturnType<typeof listCourses>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    listCourses().then(setList).catch((e) => setErr(e.message));
  }, []));

  return (
    <AdminOnly>
      <Screen>
        <Section style={{ paddingTop: 0 }}>
          <Label icon="doc">Редактор курсов</Label>
          <PrimaryButton title="+ Новый курс" onPress={() => router.push("/admin/course/new")} style={{ marginBottom: 16 }} />
          {err && <Card style={{ borderColor: C.red }}><P>{err}</P></Card>}
          {!list && !err && <ActivityIndicator color={C.red} />}
          {list?.length === 0 && <Hint>Курсов пока нет. Создайте первый.</Hint>}
          {list?.map((c) => (
            <Pressable key={c.id} onPress={() => router.push(`/admin/course/${c.id}`)} style={({ pressed }) => [s.row, pressed && { borderColor: C.gold }]}>
              <Icon name={c.direction ? DATA[c.direction].icon : "laptop"} size={26} />
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{c.title}</Text>
                <Text style={s.sub}>{fmtPrice(c.price)} · {c.published ? "опубликован" : "черновик"}</Text>
              </View>
              <View style={[s.dot, { backgroundColor: c.published ? C.green : C.hint }]} />
            </Pressable>
          ))}
          <Hint style={{ marginTop: 16 }}>
            Как это работает: создайте курс → добавьте уроки (видео YouTube «по ссылке», теория, задание, тест, карточки) → награды → опубликуйте.
            После оплаты создайте ученику код доступа в разделе «Коды» курса и отправьте ему.
          </Hint>
        </Section>
      </Screen>
    </AdminOnly>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: C.sep, backgroundColor: C.bg2, borderRadius: 14, padding: 14, marginBottom: 9 },
  title: { fontFamily: F.bold, fontSize: 15, color: C.text },
  sub: { fontFamily: F.sans, fontSize: 12, color: C.hint, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
