import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Chip, Field, Hint, Input, Label, PrimaryButton, ProgressBar, Screen, Section } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { COURSES, ONLINE } from "../../data/content";
import { fioOk, normalizePhone, phoneOk, sendRequest } from "../../lib/links";
import { useProgress } from "../../lib/progress";
import { C, F } from "../../theme";

export default function Learn() {
  const { state, openCourse, logEvent } = useProgress();
  const [course, setCourse] = useState(ONLINE[0].title);
  const [name, setName] = useState(state.profile?.name ?? "");
  const [phone, setPhone] = useState(state.profile?.phone || "+7 ");
  const [tried, setTried] = useState(false);
  const [code, setCode] = useState("");
  const [badCode, setBadCode] = useState(false);

  const myCourses = Object.keys(state.courses).filter((c) => COURSES[c]);

  function open() {
    const c = code.trim().toUpperCase();
    if (!COURSES[c]) { setBadCode(true); return; }
    setBadCode(false); setCode("");
    openCourse(c);
    router.push(`/course/${c}`);
  }

  async function request() {
    setTried(true);
    if (!fioOk(name) || !phoneOk(phone)) return;
    const via = await sendRequest(
      { action: "book_online", title: course, name: name.trim(), phone: phone.trim() },
      `Здравствуйте! Хочу на онлайн-курс «${course}».\nФИО: ${name.trim()}\nТелефон: ${phone.trim()}`,
    );
    logEvent("online_request", course);
    setTried(false);
    Alert.alert("Заявка принята", via === "server"
      ? "Спасибо! Мы свяжемся с вами и оформим доступ."
      : "Отправьте сообщение в WhatsApp — мы свяжемся с вами и выдадим код доступа к курсу.");
  }

  return (
    <Screen back={false}>
      <Section style={{ paddingTop: 0 }}>
        {myCourses.length > 0 && <>
          <Label icon="laptop">Мои курсы</Label>
          {myCourses.map((c) => {
            const total = COURSES[c].lessons.length;
            const done = state.courses[c].done;
            return (
              <Pressable key={c} style={({ pressed }) => [s.course, pressed && { borderColor: C.gold }]} onPress={() => { openCourse(c); router.push(`/course/${c}`); }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <Icon name={done >= total ? "trophy" : "play"} size={20} color={done >= total ? C.gold : C.red} />
                  <Text style={s.courseTitle}>{COURSES[c].title}</Text>
                </View>
                <ProgressBar value={done / total} color={done >= total ? C.green : C.red} />
                <Text style={s.courseSub}>{done >= total ? "Курс пройден!" : `Пройдено ${done} из ${total} · продолжить`}</Text>
              </Pressable>
            );
          })}
          <View style={{ height: 18 }} />
        </>}

        <Label icon="laptop">Онлайн-курсы</Label>
        <Field label="Выберите курс">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ONLINE.map((c) => <Chip key={c.title} title={c.title} on={c.title === course} onPress={() => setCourse(c.title)} />)}
          </View>
          <Hint>{ONLINE.find((c) => c.title === course)?.desc}</Hint>
        </Field>
        <Field label="ФИО" error="Введите фамилию и имя" showError={tried && !fioOk(name)}>
          <Input value={name} onChangeText={setName} placeholder="Фамилия Имя Отчество" autoCapitalize="words" />
        </Field>
        <Field label="Контактный телефон" error="Введите номер телефона" showError={tried && !phoneOk(phone)}>
          <Input value={phone} onChangeText={(v) => setPhone(normalizePhone(v))} keyboardType="phone-pad" placeholder="+7 ..." />
        </Field>
        <PrimaryButton title="Оставить заявку" onPress={request} />
        <Hint center style={{ marginTop: 10 }}>Мы свяжемся, расскажем детали и оформим доступ.</Hint>

        <View style={s.divider}>
          <View style={s.line} /><Text style={s.divText}>Уже оплатили?</Text><View style={s.line} />
        </View>
        <Field label="Код доступа к курсу" error="Неверный код доступа" showError={badCode}>
          <Input value={code} onChangeText={(v) => { setCode(v); setBadCode(false); }} placeholder="Введите код, который мы выдали" autoCapitalize="characters" autoCorrect={false} />
        </Field>
        <PrimaryButton title="Открыть курс" onPress={open} />
        <Hint center style={{ marginTop: 10 }}>Попробуйте демо-курс: код DEMO</Hint>
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  course: { borderWidth: 1, borderColor: C.hair, borderRadius: 14, padding: 15, marginBottom: 10, backgroundColor: C.bg2 },
  courseTitle: { flex: 1, fontFamily: F.serif, fontSize: 16, color: C.text },
  courseSub: { fontSize: 12, color: C.hint, marginTop: 8, fontFamily: F.sans },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 26, marginBottom: 16 },
  line: { flex: 1, height: 1, backgroundColor: C.hair },
  divText: { color: C.hint, fontSize: 12, fontFamily: F.sans },
});
