import { Accordion, Label, RichText, Screen, Section } from "../components/ui";
import { FAQ } from "../data/content";

export default function Faq() {
  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <Label icon="help">Правила и частые вопросы</Label>
        {FAQ.map(([q, a]) => <Accordion key={q} title={q}><RichText html={a} /></Accordion>)}
      </Section>
    </Screen>
  );
}
