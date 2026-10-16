import { Text, View } from "react-native";
import { Card, Label, Screen, Section } from "../components/ui";
import { OFFER, type OfferBlock } from "../data/content";
import { C, F } from "../theme";

function Block({ b, first }: { b: OfferBlock; first: boolean }) {
  const base = { fontSize: 13.5, lineHeight: 20, color: C.text, fontFamily: F.sans };
  if (b.t === "h" && first) return <Text style={{ fontFamily: F.serif, fontSize: 17, color: C.text, marginBottom: 4 }}>{b.x}</Text>;
  if (b.t === "h") return <Text style={[base, { fontFamily: F.bold, marginTop: 14, marginBottom: 7 }]}>{b.x}</Text>;
  if (b.t === "sub") return <Text style={[base, { color: C.hint, fontSize: 13, marginBottom: 14 }]}>{b.x}</Text>;
  if (b.t === "li") return <View style={{ flexDirection: "row", paddingLeft: 6, marginBottom: 3 }}><Text style={base}>•  </Text><Text style={[base, { flex: 1 }]}>{b.x}</Text></View>;
  return <Text style={[base, { marginBottom: 9 }]}>{b.x}</Text>;
}

export default function Offer() {
  // оферта и доп. условия для онлайн-курсов — две карточки, как на сайте
  const split = OFFER.findIndex((b) => b.t === "section");
  const main = split < 0 ? OFFER : OFFER.slice(0, split);
  const online = split < 0 ? [] : OFFER.slice(split + 1);
  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <Label icon="doc">Публичная оферта</Label>
        <Card>{main.map((b, i) => <Block key={i} b={b} first={i === 0} />)}</Card>
        {online.length > 0 && <>
          <Label icon="doc" style={{ marginTop: 22 }}>{OFFER[split].x}</Label>
          <Card>{online.map((b, i) => <Block key={i} b={b} first={false} />)}</Card>
        </>}
      </Section>
    </Screen>
  );
}
