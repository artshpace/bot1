import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useProgress } from "../lib/progress";
import { C, F } from "../theme";
import { Icon } from "./Icon";

/** Всплывающая плашка «+20 опыта · Сценическая речь» после действия. */
export function XpToast() {
  const { xpGain } = useProgress();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(xpGain);

  useEffect(() => {
    if (!xpGain) return;
    setShown(xpGain);
    anim.setValue(0);
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [xpGain?.id]);

  if (!shown) return null;
  const total = shown.items.reduce((a, i) => a + i.xp, 0);
  const names = shown.items.map((i) => i.key.split("|")[1]).join(", ");
  return (
    <Animated.View
      pointerEvents="none"
      style={[s.toast, { top: insets.top + 10, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }] }]}
    >
      <Icon name="spark" size={20} color={C.gold} strokeWidth={2} />
      <Text style={s.xp}>+{total} опыта</Text>
      <Text style={s.names} numberOfLines={1}>{names}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  toast: {
    position: "absolute", alignSelf: "center", left: 20, right: 20, flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.black, borderWidth: 1, borderColor: C.gold, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  xp: { color: C.gold, fontFamily: F.serifHeavy, fontSize: 18 },
  names: { flex: 1, color: "rgba(255,255,255,0.8)", fontFamily: F.sans, fontSize: 13 },
});
