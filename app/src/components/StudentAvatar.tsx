import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useAccount } from "../lib/account";
import { pickAvatar, uploadAvatar } from "../lib/avatar";
import { useProgress } from "../lib/progress";
import { C, F } from "../theme";
import { Icon } from "./Icon";

/** Фото ученика: своё (на телефоне) или из кабинета студии; по нажатию — сменить. */
export function useStudentPhoto(): string | null {
  const { state } = useProgress();
  const { profile } = useAccount();
  return state.profile?.photo || profile?.avatarUrl || null;
}

export function StudentAvatar({ size = 64, editable }: { size?: number; editable?: boolean }) {
  const photo = useStudentPhoto();
  const { state, setProfile } = useProgress();
  const { session } = useAccount();
  const [busy, setBusy] = useState(false);
  const initials = (state.profile?.name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  async function change(fromCamera: boolean) {
    try {
      setBusy(true);
      const p = await pickAvatar(fromCamera);
      if (!p) return;
      const base = state.profile ?? { name: "", phone: "+7 " };
      setProfile({ ...base, photo: p.dataUri });
      if (session) {
        const url = await uploadAvatar(session.user.id, p.base64);
        if (url) setProfile({ ...base, photo: url });
      }
    } catch (e) {
      Alert.alert("Фото", e instanceof Error ? e.message : "Не удалось выбрать фото");
    } finally { setBusy(false); }
  }

  function menu() {
    Alert.alert("Фото ученика", undefined, [
      { text: "Выбрать из галереи", onPress: () => change(false) },
      { text: "Сделать снимок", onPress: () => change(true) },
      ...(state.profile?.photo ? [{ text: "Убрать фото", style: "destructive" as const, onPress: () => state.profile && setProfile({ ...state.profile, photo: undefined }) }] : []),
      { text: "Отмена", style: "cancel" as const },
    ]);
  }

  const body = (
    <View style={[s.av, { width: size, height: size, borderRadius: size / 2 }]}>
      {photo ? <Image source={{ uri: photo }} contentFit="cover" style={StyleSheet.absoluteFill} />
        : initials ? <Text style={[s.initials, { fontSize: size * 0.36 }]}>{initials}</Text>
        : <Icon name="person" size={size * 0.45} color={C.gold} />}
      {busy && <View style={s.busy}><ActivityIndicator color="#fff" /></View>}
    </View>
  );
  if (!editable) return body;
  return (
    <Pressable onPress={menu} accessibilityLabel="Изменить фото">
      {body}
      <View style={s.cam}><Icon name="cam" size={14} color="#fff" strokeWidth={2} /></View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  av: { borderWidth: 2, borderColor: C.gold, backgroundColor: C.black, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  initials: { fontFamily: F.serifHeavy, color: C.gold },
  busy: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  cam: { position: "absolute", right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: C.red, borderWidth: 2, borderColor: C.bg, alignItems: "center", justifyContent: "center" },
});
