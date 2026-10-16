import { router, useLocalSearchParams } from "expo-router";
import { Card, H3, Label, P, PrimaryButton, RowLink, Screen, Section, Hint } from "../components/ui";
import { DATA, STUDIO, type DirKey } from "../data/content";
import { gcalLink, openLink, openWhatsApp, type BookingPayload } from "../lib/links";
import { C } from "../theme";

export default function Booked() {
  const { data, via } = useLocalSearchParams<{ data: string; via: string }>();
  let b: BookingPayload | null = null;
  try { b = JSON.parse(data); } catch {}
  if (!b) return null;
  const title = DATA[b.direction as DirKey]?.title ?? b.direction;

  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <Label icon="check">Вы записаны!</Label>
        <Card style={{ borderColor: C.gold }}>
          <H3>{title} — пробное занятие</H3>
          <P style={{ fontSize: 14, color: C.text }}>{b.slot_display}</P>
        </Card>

        <Label icon="info" style={{ marginTop: 22 }}>Что дальше</Label>
        <Card>
          <P>
            {via === "server"
              ? `Заявка отправлена. Мы позвоним по номеру ${b.phone}, подтвердим запись и ответим на вопросы.`
              : `Мы открыли WhatsApp с готовым сообщением — отправьте его, если ещё не отправили. Мы позвоним по номеру ${b.phone} и подтвердим запись.`}
          </P>
        </Card>

        <Label icon="pin" style={{ marginTop: 22 }}>Как нас найти</Label>
        <Card><P>{STUDIO.address}</P></Card>
        <RowLink icon="pin" title="Открыть карту (2ГИС)" onPress={() => openLink(STUDIO.map)} />

        <Label icon="doc" style={{ marginTop: 22 }}>Что взять с собой</Label>
        <Card><P>Ничего особенного — всё необходимое есть в студии. Приходите за 5–10 минут до начала. Если что-то нужно подготовить, педагог подскажет.</P></Card>

        <RowLink icon="cal" title="Добавить в календарь" onPress={() => openLink(gcalLink(`${title} — пробное (Shpigotskiy Art Space)`, b!.slot_iso))} />
        <RowLink icon="wa" iconColor={C.wa} title={via === "server" ? "Задать вопрос в WhatsApp" : "Отправить заявку в WhatsApp ещё раз"}
          onPress={() => openWhatsApp(`Здравствуйте! Я записался на пробное: ${title}, ${b!.slot_display}`)} />

        <PrimaryButton title="Готово" onPress={() => router.dismissTo("/")} style={{ marginTop: 16 }} />
        <Hint center>За запись на пробное вы получили +10 баллов.</Hint>
      </Section>
    </Screen>
  );
}
