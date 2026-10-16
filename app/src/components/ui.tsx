import { useState, type ReactNode } from "react";
import {
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Image } from "expo-image";
import { C, F } from "../theme";
import { Icon } from "./Icon";
import { mediaSource } from "../lib/media";
import type { Teacher } from "../data/content";

/* ── Экран с прокруткой и кнопкой «Назад» ── */
export function Screen({ children, back = true, padTop = true }: { children: ReactNode; back?: boolean; padTop?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: padTop ? insets.top + 64 : 0, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {back && <BackButton />}
    </View>
  );
}

export function BackButton() {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityLabel="Назад"
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      style={({ pressed }) => [st.backbtn, { top: insets.top + 12 }, pressed && { transform: [{ scale: 0.94 }] }]}
    >
      <Icon name="left" size={20} color={C.red} />
    </Pressable>
  );
}

export function Section({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ paddingHorizontal: 20, paddingTop: 22, paddingBottom: 4 }, style]}>{children}</View>;
}

/* ── Красная надпись раздела с золотой линией ── */
export function Label({ icon, children, style }: { icon?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[st.label, style]}>
      {icon && <Icon name={icon} size={15} color={C.red} />}
      <Text style={st.labelText}>{children}</Text>
      <View style={st.labelLine} />
    </View>
  );
}

export function RowLink({ icon, iconColor, title, onPress, right }: { icon?: string; iconColor?: string; title: string; onPress: () => void; right?: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.row, pressed && st.pressed]}>
      {icon && <Icon name={icon} color={iconColor ?? C.red} />}
      <Text style={st.rowText} numberOfLines={2}>{title}</Text>
      {right}
      <Icon name="chev" size={18} color={C.hint} />
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[st.card, style]}>{children}</View>;
}

export function P({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[st.p, style]}>{children}</Text>;
}

export function H3({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[st.h3, style]}>{children}</Text>;
}

export function Hint({ children, center, style }: { children: ReactNode; center?: boolean; style?: StyleProp<TextStyle> }) {
  return <Text style={[st.hint, center && { textAlign: "center" }, style]}>{children}</Text>;
}

export function PrimaryButton({ title, onPress, disabled, style, color = C.red }: { title: string; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; color?: string }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [st.btn, { backgroundColor: color }, disabled && { opacity: 0.45 }, pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 }, style]}
    >
      <Text style={st.btnText}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ title, on, disabled, onPress, style }: { title: string; on?: boolean; disabled?: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[st.chip, on && st.chipOn, disabled && { opacity: 0.4 }, style]}>
      <Text style={[st.chipText, on && { color: "#fff" }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, error, showError, children }: { label: string; error?: string; showError?: boolean; children: ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={st.fieldLabel}>{label}</Text>
      {children}
      {showError && error ? <Text style={st.err}>{error}</Text> : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      placeholderTextColor="#9b958d"
      {...props}
      onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
      style={[st.input, focus && { borderColor: C.gold }, props.style]}
    />
  );
}

/* ── Аккордеон (как «О курсе» и FAQ на сайте) ── */
export function Accordion({ title, children, initiallyOpen }: { title: string; children: ReactNode; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(!!initiallyOpen);
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: C.hair }}>
      <Pressable onPress={() => setOpen(!open)} style={st.accHead}>
        <Text style={st.accTitle}>{title}</Text>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <Icon name="chevd" size={20} color={C.gold} strokeWidth={2.2} />
        </View>
      </Pressable>
      {open && <View style={{ paddingHorizontal: 2, paddingBottom: 18 }}>{children}</View>}
    </View>
  );
}

/* ── Плашка-раскрывашка (расписание, галерея) ── */
export function Panel({ icon, title, children, initiallyOpen }: { icon: string; title: string; children: ReactNode; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(!!initiallyOpen);
  return (
    <View style={st.panel}>
      <Pressable onPress={() => setOpen(!open)} style={st.panelHead}>
        <Icon name={icon} size={20} />
        <Text style={[st.accTitle, { fontSize: 18, flex: 1 }]}>{title}</Text>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <Icon name="chevd" size={18} color={C.gold} />
        </View>
      </Pressable>
      {open && <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>{children}</View>}
    </View>
  );
}

/* ── Текст с <b> и <br> из контента сайта ── */
export function RichText({ html, style }: { html: string; style?: StyleProp<TextStyle> }) {
  const parts = html.replace(/<br\s*\/?>/g, "\n").split(/(<b>.*?<\/b>)/g);
  return (
    <Text style={[st.p, { fontSize: 14 }, style]}>
      {parts.map((p, i) =>
        p.startsWith("<b>")
          ? <Text key={i} style={{ fontFamily: F.bold, color: C.text }}>{p.slice(3, -4)}</Text>
          : <Text key={i}>{p.replace(/<[^>]+>/g, "")}</Text>,
      )}
    </Text>
  );
}

export function ProgressBar({ value, color = C.red, height = 8, track = C.bg3 }: { value: number; color?: string; height?: number; track?: string }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: "hidden" }}>
      <View style={{ height: "100%", width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  );
}

/* ── Аватар педагога: фото или иконка направления ── */
export function TeacherAvatar({ t, size }: { t: Teacher; size: number }) {
  const [failed, setFailed] = useState(false);
  const src = mediaSource(t.photo);
  return (
    <View style={[st.avatar, { width: size, height: size, borderRadius: size / 2, borderWidth: size > 100 ? 3 : 2 }]}>
      <Icon name={t.icon || "person"} size={size * 0.42} color={C.gold} />
      {src && !failed && (
        <Image source={src} onError={() => setFailed(true)} contentFit="cover" style={StyleSheet.absoluteFill} />
      )}
    </View>
  );
}

export const st = StyleSheet.create({
  backbtn: {
    position: "absolute", left: 14, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: C.hair,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  label: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
  labelText: { fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.red, fontFamily: F.bold },
  labelLine: { flex: 1, height: 1, backgroundColor: C.hair },
  row: {
    flexDirection: "row", alignItems: "center", gap: 13, borderWidth: 1, borderColor: C.sep, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 15, marginBottom: 9, backgroundColor: C.bg2,
  },
  pressed: { transform: [{ scale: 0.98 }], borderColor: C.gold },
  rowText: { flex: 1, color: C.text, fontSize: 14.5, fontFamily: F.semi },
  card: { backgroundColor: C.bg2, borderWidth: 1, borderColor: C.sep, borderRadius: 16, padding: 17, marginBottom: 11 },
  p: { fontSize: 13.5, lineHeight: 21, color: C.hint, fontFamily: F.sans },
  h3: { fontFamily: F.serif, fontSize: 18, color: C.text, marginBottom: 6 },
  hint: { fontSize: 12, color: C.hint, marginTop: 6, fontFamily: F.sans, lineHeight: 17 },
  btn: { borderRadius: 15, paddingVertical: 16, alignItems: "center", marginTop: 6 },
  btnText: { color: "#fff", fontSize: 16, fontFamily: F.bold },
  chip: { borderWidth: 1, borderColor: C.sep, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: C.bg2, alignItems: "center" },
  chipOn: { backgroundColor: C.red, borderColor: C.red },
  chipText: { fontSize: 13.5, fontFamily: F.semi, color: C.hint },
  fieldLabel: { fontSize: 12.5, fontFamily: F.bold, color: C.text, marginBottom: 8 },
  err: { color: C.red, fontSize: 12.5, marginTop: 6, fontFamily: F.sans },
  input: { borderWidth: 1, borderColor: C.sep, borderRadius: 13, padding: 14, fontSize: 15, fontFamily: F.sans, backgroundColor: C.bg2, color: C.text },
  accHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, paddingVertical: 17, paddingHorizontal: 2 },
  accTitle: { flex: 1, fontFamily: F.serif, fontSize: 17, color: C.text },
  panel: { borderWidth: 1, borderColor: C.hair, borderRadius: 14, backgroundColor: C.bg2, marginBottom: 10, overflow: "hidden" },
  panelHead: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  avatar: { borderColor: C.gold, backgroundColor: C.bg3, alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
