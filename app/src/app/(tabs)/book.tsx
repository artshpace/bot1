import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Chip, Field, Hint, Input, Label, PrimaryButton, RowLink, Screen, Section } from "../../components/ui";
import { DATA, ORDER, type DirKey } from "../../data/content";
import { computeSlots, fioOk, normalizePhone, openWhatsApp, phoneOk, sendRequest, type BookingPayload } from "../../lib/links";
import { useProgress } from "../../lib/progress";
import { C } from "../../theme";

export default function Book() {
  const params = useLocalSearchParams<{ dir?: string }>();
  const { state, logEvent } = useProgress();
  const [dir, setDir] = useState<DirKey>("guitar");
  const [ptype, setPtype] = useState<"child" | "adult">("child");
  const [child, setChild] = useState("");
  const [parent, setParent] = useState(state.profile?.name ?? "");
  const [phone, setPhone] = useState(state.profile?.phone || "+7 ");
  const [slotIdx, setSlotIdx] = useState(0);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);

  // переход со страницы направления / расписания: ?dir=acting
  useEffect(() => {
    if (params.dir && params.dir in DATA) setDir(params.dir as DirKey);
  }, [params.dir]);

  // взрослые — только на гитаре
  useEffect(() => { if (dir !== "guitar" && ptype === "adult") setPtype("child"); setSlotIdx(0); }, [dir]);

  const slots = useMemo(() => computeSlots(DATA[dir].slots), [dir]);
  const errChild = !fioOk(child);
  const errParent = ptype === "child" && !fioOk(parent);
  const errPhone = !phoneOk(phone);

  async function submit() {
    setTried(true);
    const slot = slots[slotIdx];
    if (errChild || errParent || errPhone || !slot) return;
    const b: BookingPayload = {
      action: "book", direction: dir, ptype, child: child.trim(), parent: ptype === "child" ? parent.trim() : "",
      phone: phone.trim(), slot_display: slot.display, slot_iso: slot.iso,
    };
    const who = ptype === "child" ? `Ребёнок: ${b.child}\nРодитель: ${b.parent}` : `Ученик: ${b.child}`;
    const wa = `Здравствуйте! Хочу записаться на пробное занятие.\nНаправление: ${DATA[dir].title}\n${who}\nТелефон: ${b.phone}\nВремя: ${b.slot_display}`;
    setSending(true);
    const via = await sendRequest(b, wa);
    setSending(false);
    logEvent("booking", dir);
    setTried(false); setChild("");
    router.push({ pathname: "/booked", params: { data: JSON.stringify(b), via } });
  }

  return (
    <Screen back={false}>
      <Section style={{ paddingTop: 0 }}>
        <Label icon="plus">Запись на пробное занятие</Label>

        <Field label="Направление">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ORDER.map((k) => <Chip key={k} title={DATA[k].title} on={k === dir} onPress={() => setDir(k)} />)}
          </View>
        </Field>

        <Field label="Кто будет заниматься">
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip title="Ребёнок" on={ptype === "child"} onPress={() => setPtype("child")} style={{ flex: 1 }} />
            <Chip title="Взрослый" on={ptype === "adult"} disabled={dir !== "guitar"} onPress={() => setPtype("adult")} style={{ flex: 1 }} />
          </View>
          {dir !== "guitar" && <Hint>Для взрослых сейчас доступна только гитара.</Hint>}
        </Field>

        <Field label={ptype === "child" ? "ФИО ребёнка" : "Ваше ФИО"} error="Введите фамилию и имя" showError={tried && errChild}>
          <Input value={child} onChangeText={setChild} placeholder={ptype === "child" ? "Например: Иванов Иван" : "Например: Иванова Мария"} autoCapitalize="words" />
        </Field>

        {ptype === "child" && (
          <Field label="ФИО родителя" error="Введите фамилию и имя" showError={tried && errParent}>
            <Input value={parent} onChangeText={setParent} placeholder="Кто приведёт ребёнка" autoCapitalize="words" />
          </Field>
        )}

        <Field label="Контактный телефон" error="Введите номер телефона" showError={tried && errPhone}>
          <Input value={phone} onChangeText={(v) => setPhone(normalizePhone(v))} keyboardType="phone-pad" placeholder="+7 ..." />
        </Field>

        <Field label="Дата и время">
          <View style={{ gap: 8 }}>
            {slots.map((sl, i) => <Chip key={sl.iso} title={sl.display} on={i === slotIdx} onPress={() => setSlotIdx(i)} style={{ alignItems: "flex-start" }} />)}
          </View>
          <Hint>Свободные слоты по расписанию направления</Hint>
        </Field>

        <PrimaryButton title={sending ? "Отправляем…" : "Отправить заявку"} disabled={sending} onPress={submit} />
        <View style={{ marginTop: 12 }}>
          <RowLink icon="wa" iconColor={C.wa} title="Задать вопрос в WhatsApp" onPress={() => openWhatsApp("Здравствуйте! У меня вопрос по записи на пробное занятие.")} />
        </View>
        <Hint center style={{ marginTop: 10 }}>Первое занятие — бесплатно. Мы перезвоним и подтвердим.</Hint>
      </Section>
    </Screen>
  );
}
