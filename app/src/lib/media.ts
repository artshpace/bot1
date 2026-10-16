import type { ImageSource } from "expo-image";
import { SITE_URL } from "../config";

// Файлы, которые уже лежат в репозитории сайта, вшиты в приложение.
const LOCAL: Record<string, number> = {
  "media/teachers/shpigotskiy.jpg": require("../../assets/media/teacher-shpigotskiy.jpg"),
  "media/acting/1.jpg": require("../../assets/media/acting-1.jpg"),
  "media/guitar/photo_2026-06-17_09-38-10.jpg": require("../../assets/media/guitar-1.jpg"),
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
