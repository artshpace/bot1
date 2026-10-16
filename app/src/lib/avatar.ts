import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { supabase } from "./supabase";

/** base64 → байты (для загрузки в хранилище Supabase). */
function b64ToBytes(b64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0, buf = 0, bits = 0;
  for (const ch of clean) {
    buf = (buf << 6) | chars.indexOf(ch); bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 0xff; }
  }
  return out.subarray(0, o);
}

/**
 * Выбрать фото из галереи (или снять камерой), обрезать квадратом, уменьшить до 400px.
 * Возвращает data-URI для хранения на телефоне и base64 для загрузки.
 */
export async function pickAvatar(fromCamera = false): Promise<{ dataUri: string; base64: string } | null> {
  const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(fromCamera ? "Нет доступа к камере — разрешите его в настройках телефона." : "Нет доступа к фото — разрешите его в настройках телефона.");
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: "images", allowsEditing: true, aspect: [1, 1], quality: 1 };
  const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const ref = await ImageManipulator.manipulate(res.assets[0].uri).resize({ width: 400 }).renderAsync();
  const saved = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (!saved.base64) return null;
  return { dataUri: `data:image/jpeg;base64,${saved.base64}`, base64: saved.base64 };
}

/** Загрузить фото в кабинет студии (bucket avatars, миграция 0033). Возвращает публичный URL или null. */
export async function uploadAvatar(userId: string, base64: string): Promise<string | null> {
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const up = await supabase.storage.from("avatars").upload(path, b64ToBytes(base64), { contentType: "image/jpeg", upsert: true });
  if (up.error) return null;
  const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
  return url;
}
