import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEventListener } from "expo";
import { Screen, Section, TeacherAvatar } from "../../components/ui";
import { mediaSource, mediaUrl } from "../../lib/media";
import { TEACHERS } from "../../lib/teachers";
import { C, F } from "../../theme";

function TeacherVideo({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  const player = useVideoPlayer(mediaUrl(src));
  useEventListener(player, "statusChange", ({ status }) => { if (status === "error") setFailed(true); });
  if (failed) return null;
  return (
    <View style={s.video}>
      <VideoView player={player} nativeControls contentFit="contain" style={{ width: "100%", aspectRatio: 9 / 16 }} />
    </View>
  );
}

function Photo({ path }: { path: string }) {
  const [failed, setFailed] = useState(false);
  const src = mediaSource(path);
  if (failed || !src) return null;
  return <Image source={src} onError={() => setFailed(true)} contentFit="cover" style={s.photo} />;
}

export default function TeacherScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = TEACHERS[Number(id)];
  if (!t) return null;
  const photos = (t.photos ?? []).filter((p) => p !== t.photo);
  const bio = Array.isArray(t.bio) ? t.bio : [t.bio];

  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <TeacherAvatar t={t} size={118} />
        <Text style={s.name}>{t.name}</Text>
        <Text style={s.role}>{t.role}</Text>
        {bio.map((b, i) => <Text key={i} style={s.bio}>{b}</Text>)}
        {t.video ? <TeacherVideo src={t.video} /> : null}
        {photos.length > 0 && (
          <View style={s.grid}>{photos.map((p) => <Photo key={p} path={p} />)}</View>
        )}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  name: { fontFamily: F.serifHeavy, fontSize: 26, color: C.text, marginTop: 16, marginBottom: 4 },
  role: { color: C.red, fontSize: 13.5, marginBottom: 16, fontFamily: F.semi },
  bio: { color: C.hint, fontSize: 14.5, lineHeight: 23, fontFamily: F.sans, marginBottom: 9 },
  video: { marginTop: 18, borderRadius: 14, overflow: "hidden", backgroundColor: C.bg3 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  photo: { width: "48%", aspectRatio: 1, borderRadius: 14, backgroundColor: C.bg3 },
});
