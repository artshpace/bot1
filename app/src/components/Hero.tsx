import { useId, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEventListener } from "expo";
import { C, F } from "../theme";
import { mediaUrl } from "../lib/media";

/** Шапка как на сайте: тёмный постер, фоновое видео (если есть на сайте), заголовок. */
export function Hero({ eyebrow, title, tagline, video }: { eyebrow: string; title: string; tagline?: string; video?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, ""); // уникальные id градиентов на каждую шапку
  return (
    <View style={s.hero}>
      <LinearGradient colors={["#241c14", "#0e0d0c"]} start={{ x: 0.8, y: 0 }} end={{ x: 0.2, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* мягкое красное и золотое свечение, как radial-gradient на сайте */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id={"red" + uid} cx="72%" cy="18%" rx="80%" ry="60%">
            <Stop offset="0" stopColor="#E30613" stopOpacity="0.5" />
            <Stop offset="0.6" stopColor="#E30613" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={"gold" + uid} cx="18%" cy="92%" rx="60%" ry="50%">
            <Stop offset="0" stopColor="#C9A84C" stopOpacity="0.22" />
            <Stop offset="0.6" stopColor="#C9A84C" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#red${uid})`} />
        <Rect width="100%" height="100%" fill={`url(#gold${uid})`} />
      </Svg>
      {video ? <HeroVideo key={video} src={mediaUrl(video)} /> : null}
      <LinearGradient colors={["transparent", "rgba(14,13,12,0.5)", "rgba(14,13,12,0.92)"]} locations={[0.28, 0.68, 1]} style={StyleSheet.absoluteFill} />
      <View style={s.inner}>
        <View style={s.eyebrowRow}>
          <View style={s.eyebrowLine} />
          <Text style={s.eyebrow}>{eyebrow}</Text>
        </View>
        <Text style={s.title}>{title}</Text>
        {tagline ? <Text style={s.tagline}>{tagline}</Text> : null}
      </View>
    </View>
  );
}

function HeroVideo({ src }: { src: string }) {
  const [ready, setReady] = useState(false);
  const player = useVideoPlayer(src, (p) => { p.loop = true; p.muted = true; p.play(); });
  useEventListener(player, "statusChange", ({ status }) => setReady(status === "readyToPlay"));
  return (
    <VideoView
      player={player}
      nativeControls={false}
      contentFit="cover"
      style={[StyleSheet.absoluteFill, { opacity: ready ? 1 : 0 }]}
    />
  );
}

const s = StyleSheet.create({
  hero: { height: 300, justifyContent: "flex-end", overflow: "hidden", backgroundColor: C.black },
  inner: { padding: 22 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  eyebrowLine: { width: 24, height: 1, backgroundColor: C.gold },
  eyebrow: { fontSize: 11, letterSpacing: 2.4, textTransform: "uppercase", color: C.gold, fontFamily: F.bold },
  title: { fontFamily: F.serifHeavy, fontSize: 40, lineHeight: 42, color: "#fff" },
  tagline: { marginTop: 12, fontSize: 15, lineHeight: 22, color: "rgba(255,255,255,0.82)", fontFamily: F.sans, maxWidth: 320 },
});
