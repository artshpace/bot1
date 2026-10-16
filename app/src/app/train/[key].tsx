import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Hint, Label, PrimaryButton, ProgressBar, Screen, Section } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { getCourse } from "../../lib/courses";
import { CARD_BOX_DAYS, CARD_XP, cardsDueList, useProgress } from "../../lib/progress";
import { C, F } from "../../theme";

/** Тренировка карточками с интервальным повторением (система Лейтнера, как в Lingualeo/Anki). */
export default function Train() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { state, reviewCard } = useProgress();
  const c = getCourse(key);
  // колода фиксируется в начале тренировки, «не знаю» — карточка уходит в конец
  const [deck, setDeck] = useState(() => cardsDueList(state, key));
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const total = useMemo(() => deck.length, []);
  if (!c) return null;
  const card = deck[0];

  function answer(ok: boolean) {
    if (!card) return;
    reviewCard(card.id, ok, key, card.lesson);
    setFlipped(false);
    if (ok) { setKnown((k) => k + 1); setDeck((d) => d.slice(1)); }
    else setDeck((d) => [...d.slice(1), { ...card, box: 0 }]);
  }

  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <Label icon="spark">Карточки · {c.title}</Label>
        {total > 0 && <><ProgressBar value={known / total} color={C.gold} /><Hint style={{ marginBottom: 16 }}>Запомнено {known} из {total}</Hint></>}

        {!card ? (
          <View style={s.done}>
            <Icon name="trophy" size={48} color={C.gold} />
            <Text style={s.doneTitle}>{total ? "Тренировка завершена!" : "Сейчас повторять нечего"}</Text>
            <Text style={s.doneText}>
              {total ? `Вы повторили ${total} карточек. Следующий повтор — через ${CARD_BOX_DAYS[1]}–${CARD_BOX_DAYS[3]} дн.: так знания переходят в долгую память.`
                : "Новые карточки появляются по мере прохождения уроков, а выученные возвращаются на повтор через несколько дней."}
            </Text>
            <PrimaryButton title="К курсу" onPress={() => router.back()} style={{ alignSelf: "stretch", marginTop: 16 }} />
          </View>
        ) : (
          <>
            <Pressable onPress={() => setFlipped(!flipped)} style={[s.card, flipped && s.cardBack]}>
              <Text style={s.side}>{flipped ? "Ответ" : "Вопрос · нажмите, чтобы перевернуть"}</Text>
              <Text style={[s.text, flipped && { color: "#fff" }]}>{flipped ? card.back : card.front}</Text>
              <View style={s.boxes}>{[1, 2, 3, 4, 5].map((n) => <View key={n} style={[s.box, n <= card.box && { backgroundColor: C.gold }]} />)}</View>
            </Pressable>
            {flipped ? (
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <PrimaryButton title="Не помню" color={C.hint} onPress={() => answer(false)} style={{ flex: 1 }} />
                <PrimaryButton title="Помню" color={C.green} onPress={() => answer(true)} style={{ flex: 1 }} />
              </View>
            ) : (
              <PrimaryButton title="Показать ответ" color={C.black} onPress={() => setFlipped(true)} style={{ marginTop: 16 }} />
            )}
            <Hint center style={{ marginTop: 10 }}>«Помню» — +{CARD_XP} опыта (до 20 в день). Чем лучше помните, тем реже карточка возвращается.</Hint>
          </>
        )}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { minHeight: 260, borderRadius: 20, borderWidth: 2, borderColor: C.gold, backgroundColor: C.paper, padding: 22, justifyContent: "center", alignItems: "center" },
  cardBack: { backgroundColor: C.black },
  side: { position: "absolute", top: 16, fontSize: 10.5, letterSpacing: 1.4, textTransform: "uppercase", color: C.goldDark, fontFamily: F.bold },
  text: { fontFamily: F.serif, fontSize: 24, lineHeight: 30, color: C.text, textAlign: "center" },
  boxes: { position: "absolute", bottom: 16, flexDirection: "row", gap: 5 },
  box: { width: 18, height: 5, borderRadius: 3, backgroundColor: C.bg3 },
  done: { alignItems: "center", backgroundColor: C.bg2, borderRadius: 18, padding: 24, borderWidth: 1, borderColor: C.hair },
  doneTitle: { fontFamily: F.serif, fontSize: 22, color: C.text, marginTop: 10 },
  doneText: { fontFamily: F.sans, fontSize: 14, color: C.hint, textAlign: "center", marginTop: 6, lineHeight: 20 },
});
