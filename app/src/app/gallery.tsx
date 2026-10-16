import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEventListener } from "expo";
import { Hint, Label, Panel, Screen, Section } from "../components/ui";
import { DATA, GALLERY, ORDER, type GalleryItem } from "../data/content";
import { mediaSource, mediaUrl } from "../lib/media";
import { C } from "../theme";

// Файлы берутся с сайта (media/gallery/<направление>/...). Нет файла — ячейка скрывается.

function VideoCell({ src, onFail }: { src: string; onFail: () => void }) {
  const player = useVideoPlayer(mediaUrl(src), (p) => { p.loop = true; });
  useEventListener(player, "statusChange", ({ status }) => { if (status === "error") onFail(); });
  return <VideoView player={player} nativeControls contentFit="cover" style={StyleSheet.absoluteFill} />;
}

function Cell({ item, onFail }: { item: GalleryItem; onFail: () => void }) {
  return (
    <View style={[s.cell, item.wide && s.wide]}>
      {item.type === "video"
        ? <VideoCell src={item.src} onFail={onFail} />
        : <Image source={mediaSource(item.src)} onError={onFail} contentFit="cover" style={StyleSheet.absoluteFill} />}
    </View>
  );
}

function DirGallery({ items }: { items: GalleryItem[] }) {
  const [failed, setFailed] = useState<string[]>([]);
  const visible = items.filter((i) => !failed.includes(i.src));
  if (!visible.length) return <Hint>Скоро здесь появятся фото и видео.</Hint>;
  return (
    <View style={s.grid}>
      {visible.map((it) => <Cell key={it.src} item={it} onFail={() => setFailed((f) => [...f, it.src])} />)}
    </View>
  );
}

export default function Gallery() {
  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <Label icon="image">Выступления и работы</Label>
        {ORDER.map((k, i) => (
          <Panel key={k} icon={DATA[k].icon} title={DATA[k].title} initiallyOpen={i === 0}>
            <DirGallery items={GALLERY[k] ?? []} />
          </Panel>
        ))}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  cell: { width: "48.8%", aspectRatio: 1, borderRadius: 14, overflow: "hidden", backgroundColor: C.bg3 },
  wide: { width: "100%", aspectRatio: 16 / 9 },
});
