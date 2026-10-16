import type { ImageSource } from "expo-image";
import { SITE_URL } from "../config";

// Файлы, которые уже лежат в репозитории сайта, вшиты в приложение.
const LOCAL: Record<string, number> = {
  "media/teachers/shpigotskiy.jpg": require("../../assets/media/teacher-shpigotskiy.jpg"),
  "media/acting/1.jpg": require("../../assets/media/acting-1.jpg"),
  "media/guitar/1.jpg": require("../../assets/media/guitar-1.jpg"),
  "media/teachers/zhukov-portrait.jpg": require("../../assets/media/teacher-zhukov.jpg"),
};

/** Путь с сайта ("media/...") → источник картинки: вшитый файл или файл с сайта. */
export function mediaSource(path?: string): ImageSource | number | null {
  if (!path) return null;
  if (LOCAL[path]) return LOCAL[path];
  return { uri: mediaUrl(path) };
}

export function mediaUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return SITE_URL + path;
}
