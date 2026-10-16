import { Modal, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { awardDef, POINTS, useProgress } from "../lib/progress";
import { C, F } from "../theme";
import { Icon } from "./Icon";
import { PrimaryButton } from "./ui";

/** Поздравление с новой наградой — показывается поверх любого экрана. */
export function AwardModal() {
  const { pendingAwards, dismissAward } = useProgress();
  const award = pendingAwards[0] ? awardDef(pendingAwards[0]) : undefined;
  if (!award) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={dismissAward}>
      <View style={s.backdrop}>
        <View style={s.box}>
          <Text style={s.eyebrow}>{award.course ? `Награда курса` : "Новая награда!"}</Text>
          {award.course ? <Text style={s.course}>{award.course}</Text> : null}
          <View style={s.medal}><Icon name={award.icon} size={44} color={C.gold} strokeWidth={1.8} /></View>
          <Text style={s.title}>{award.title}</Text>
          <Text style={s.desc}>{award.desc}</Text>
          <Text style={s.points}>+{POINTS.award} баллов</Text>
          <PrimaryButton title="Ура!" onPress={dismissAward} style={{ alignSelf: "stretch", marginTop: 18 }} />
          <Text style={s.link} onPress={() => { dismissAward(); router.navigate("/profile"); }}>Все мои награды</Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 28 },
  box: { backgroundColor: C.bg, borderRadius: 22, padding: 24, alignItems: "center", width: "100%", maxWidth: 360, borderWidth: 1, borderColor: C.gold },
  eyebrow: { fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.red, fontFamily: F.bold, marginBottom: 16 },
  medal: { width: 96, height: 96, borderRadius: 48, backgroundColor: C.black, borderWidth: 3, borderColor: C.gold, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { fontFamily: F.serifHeavy, fontSize: 26, color: C.text, textAlign: "center" },
  desc: { fontFamily: F.sans, fontSize: 14, color: C.hint, textAlign: "center", marginTop: 6 },
  points: { fontFamily: F.bold, fontSize: 15, color: C.goldDark, marginTop: 12 },
  course: { fontFamily: F.semi, fontSize: 13, color: C.hint, marginTop: -10, marginBottom: 14, textAlign: "center" },
  link: { marginTop: 14, color: C.red, fontFamily: F.semi, fontSize: 14 },
});
