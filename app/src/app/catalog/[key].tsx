import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { BackButton, Card, Hint, Label, P, PrimaryButton, RowLink, Section } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { fmtPrice } from "../../components/CourseBlocks";
import { DATA } from "../../data/content";
import { useAccount } from "../../lib/account";
import { getCourse, useCourses } from "../../lib/courses";
import { lessonsWord } from "../../lib/game";
import { openLink, openWhatsApp } from "../../lib/links";
import { useProgress } from "../../lib/progress";
import { C, F } from "../../theme";

/** Страница курса в каталоге — как на Coursera: что внутри, чему научитесь, программа, цена. */
export default function CatalogCourse() {
  const { key } = useLocalSearchParams<{ key: string }>();
  useCourses(); // перерисовать после загрузки курсов
  const c = getCourse(key);
  const { openCourse } = useProgress();
  const { profile, session } = useAccount();
  if (!c) return null;
  const who = `${profile?.name ? `\nФИО: ${profile.name}` : ""}${profile?.phone ? `\nТелефон: ${profile.phone}` : ""}`;
  const start = () => { openCourse(c.key); router.replace(`/course/${c.key}`); };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.cover}>
          {c.cover ? <Image source={{ uri: c.cover }} contentFit="cover" style={StyleSheet.absoluteFill} /> : <View style={s.coverPh}><Icon name={c.direction ? DATA[c.direction].icon : "laptop"} size={64} /></View>}
          <View style={s.shade} />
          <View style={s.coverText}>
            <Text style={s.eyebrow}>{c.direction ? DATA[c.direction].title : "Онлайн-курс"} · {lessonsWord(c.outline.length || c.lessons.length)}</Text>
            <Text style={s.title}>{c.title}</Text>
          </View>
        </View>

        <Section>
          {c.summary ? <P style={{ fontSize: 15, color: C.text }}>{c.summary}</P> : null}
          {c.description ? <P style={{ marginTop: 10 }}>{c.description}</P> : null}
        </Section>

        {c.outcomes?.length ? (
          <Section>
            <Label icon="check">Чему научитесь</Label>
            {c.outcomes.map((o) => (
              <View key={o} style={s.outcome}><Icon name="check" size={18} color={C.green} strokeWidth={2.4} /><Text style={s.outcomeText}>{o}</Text></View>
            ))}
          </Section>
        ) : null}

        <Section>
          <Label icon="doc">Программа</Label>
          {(c.outline.length ? c.outline : c.lessons).map((l, i) => (
            <View key={i} style={s.lesson}>
              <Text style={s.num}>{i + 1}</Text>
              <Text style={s.lessonTitle}>{l.title}</Text>
              {l.free ? <Text style={s.free}>бесплатно</Text> : !c.enrolled ? <Icon name="lock" size={16} color={C.hint} /> : null}
            </View>
          ))}
        </Section>

        {c.awards?.some((a) => a.title) ? (
          <Section>
            <Label icon="trophy">Награды курса</Label>
            <View style={s.awards}>
              {c.awards.filter((a) => a.title).map((a) => (
                <View key={a.id} style={s.award}>
                  <View style={s.medal}><Icon name={a.icon} size={22} color={C.gold} /></View>
                  <Text style={s.awTitle} numberOfLines={2}>{a.title}</Text>
                  <Text style={s.awDesc} numberOfLines={3}>{a.desc}</Text>
                </View>
              ))}
            </View>
            <Hint>По окончании курса — именной сертификат студии.</Hint>
          </Section>
        ) : null}

        <Section>
          {c.enrolled ? (
            <PrimaryButton title="Начать обучение" onPress={start} />
          ) : (
            <Card style={{ borderColor: C.gold, alignItems: "center" }}>
              <Text style={s.price}>{fmtPrice(c.price)}</Text>
              <Hint center style={{ marginTop: 2, marginBottom: 12 }}>доступ к курсу навсегда</Hint>
              {c.payUrl ? (
                <>
                  <PrimaryButton title="Оплатить" onPress={() => openLink(c.payUrl!)} style={{ alignSelf: "stretch" }} />
                  <Text style={s.link} onPress={() => openWhatsApp(`Здравствуйте! Я оплатил онлайн-курс «${c.title}». Пришлите, пожалуйста, код доступа.${who}`)}>
                    Я оплатил — получить код доступа
                  </Text>
                </>
              ) : (
                <PrimaryButton title="Оставить заявку" style={{ alignSelf: "stretch" }}
                  onPress={() => openWhatsApp(`Здравствуйте! Хочу на онлайн-курс «${c.title}».${who}`)} />
              )}
            </Card>
          )}
          {!c.enrolled && c.outline.some((l) => l.free) && session && (
            <RowLink icon="play" title="Попробовать бесплатный урок" onPress={start} />
          )}
          {!c.enrolled && (
            <Hint center>После оплаты студия пришлёт код. Введите его во вкладке «Обучение» → «Уже оплатили?»{session ? "" : " — для этого нужно войти в кабинет студии"}.</Hint>
          )}
        </Section>
      </ScrollView>
      <BackButton />
    </View>
  );
}

const s = StyleSheet.create({
  cover: { height: 240, backgroundColor: C.black, justifyContent: "flex-end" },
  coverPh: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "#241c14" },
  shade: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(14,13,12,0.45)" },
  coverText: { padding: 20 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase", color: C.gold, fontFamily: F.bold },
  title: { fontFamily: F.serifHeavy, fontSize: 28, lineHeight: 32, color: "#fff", marginTop: 6 },
  outcome: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 8 },
  outcomeText: { flex: 1, fontFamily: F.sans, fontSize: 14.5, color: C.text, lineHeight: 20 },
  lesson: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.hair },
  num: { width: 24, fontFamily: F.serif, fontSize: 15, color: C.goldDark },
  lessonTitle: { flex: 1, fontFamily: F.sans, fontSize: 14, color: C.text },
  free: { fontFamily: F.bold, fontSize: 11, color: C.green },
  awards: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  award: { width: "48.5%", alignItems: "center", backgroundColor: C.bg2, borderWidth: 1, borderColor: C.sep, borderRadius: 14, padding: 12 },
  medal: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.black, borderWidth: 2, borderColor: C.gold, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  awTitle: { fontFamily: F.bold, fontSize: 13, color: C.text, textAlign: "center" },
  awDesc: { fontFamily: F.sans, fontSize: 11.5, color: C.hint, textAlign: "center", marginTop: 2 },
  price: { fontFamily: F.serifHeavy, fontSize: 32, color: C.text },
  link: { color: C.red, fontFamily: F.semi, fontSize: 14, marginTop: 14 },
});
