import { Card, Label, P, RowLink, Screen, Section } from "../components/ui";
import { STUDIO } from "../data/content";
import { emailMenu, openLink, openWhatsApp } from "../lib/links";
import { C } from "../theme";

export default function About() {
  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <Label icon="info">О студии</Label>
        <Card><P>Творческая студия Shpigotskiy Art Space — 160+ учеников, пять направлений. Наши дети выступают на сцене областного театра, снимаются в кино и ставят собственные спектакли. Главное для нас — раскрыть в ребёнке уверенность.</P></Card>
        <Label icon="info" style={{ marginTop: 22 }}>Наша история</Label>
        <Card><P>Здесь будет история студии — как всё начиналось, как мы росли и каких результатов добились вместе с нашими учениками. Текст добавим позже.</P></Card>
        <Label icon="chat" style={{ marginTop: 22 }}>Контакты</Label>
        <RowLink icon="pin" title={STUDIO.address} onPress={() => openLink(STUDIO.map)} />
        <RowLink icon="wa" iconColor={C.wa} title="WhatsApp" onPress={() => openWhatsApp()} />
        <RowLink icon="cam" title="Instagram" onPress={() => openLink(STUDIO.instagram)} />
        <RowLink icon="mail" title={STUDIO.email} onPress={emailMenu} />
      </Section>
    </Screen>
  );
}
