import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { Teacher } from "../data/content";
import { bioText, teacherId } from "../lib/teachers";
import { C, F } from "../theme";
import { Icon } from "./Icon";
import { TeacherAvatar } from "./ui";

/** Карточка педагога: большая (один педагог) или компактная (список). */
export function TeacherCard({ t, big }: { t: Teacher; big?: boolean }) {
  const open = () => router.push(`/teacher/${teacherId(t)}`);
  if (big) {
    return (
      <Pressable onPress={open} style={({ pressed }) => [s.big, pressed && s.pressed]}>
        <TeacherAvatar t={t} size={72} />
        <View style={{ flex: 1 }}>
          <Text style={s.bigName}>{t.name}</Text>
          <Text style={s.bigRole}>{t.role}</Text>
          <Text style={s.bio} numberOfLines={4}>{bioText(t.bio)}</Text>
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={open} style={({ pressed }) => [s.card, pressed && s.pressed]}>
      <TeacherAvatar t={t} size={50} />
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{t.name}</Text>
        <Text style={s.role}>{t.role}</Text>
      </View>
      <Icon name="chev" size={18} color={C.hint} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  big: { flexDirection: "row", alignItems: "center", gap: 15, backgroundColor: C.bg2, borderWidth: 1, borderColor: C.sep, borderRadius: 18, padding: 17 },
  bigName: { fontFamily: F.serif, fontSize: 18, color: C.text, marginBottom: 3 },
  bigRole: { fontSize: 12, color: C.red, marginBottom: 6, fontFamily: F.semi },
  bio: { fontSize: 12.5, color: C.hint, fontFamily: F.sans, lineHeight: 18 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.bg2, borderWidth: 1, borderColor: C.sep, borderRadius: 16, padding: 13, marginBottom: 10 },
  name: { fontFamily: F.serif, fontSize: 16, color: C.text },
  role: { fontSize: 11.5, color: C.hint, fontFamily: F.sans },
  pressed: { transform: [{ scale: 0.98 }], borderColor: C.gold },
});
