import { Alert, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import { STUDIO } from "../data/content";
import { BOOKING_WEBHOOK } from "../config";

export async function openLink(url: string) {
  try { await Linking.openURL(url); }
  catch { Alert.alert("Не удалось открыть ссылку", url); }
}

export const openWhatsApp = (text?: string) =>
  openLink(STUDIO.whatsapp + (text ? "?text=" + encodeURIComponent(text) : ""));

/** Номер: написать в WhatsApp или позвонить. */
export function phoneMenu(title: string, phone: string, display: string) {
  Alert.alert(title, display, [
    { text: "Написать в WhatsApp", onPress: () => openLink("https://wa.me/" + phone.replace(/\D/g, "")) },
    { text: "Позвонить", onPress: () => openLink("tel:" + phone) },
    { text: "Отмена", style: "cancel" },
  ]);
}

export function emailMenu() {
  Alert.alert("Написать на почту", STUDIO.email, [
    { text: "Написать письмо", onPress: () => openLink("mailto:" + STUDIO.email) },
    { text: "Скопировать адрес", onPress: async () => { await Clipboard.setStringAsync(STUDIO.email); Alert.alert("E-mail", "Адрес скопирован:\n" + STUDIO.email); } },
    { text: "Отмена", style: "cancel" },
  ]);
}

const DAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const pad = (n: number) => String(n).padStart(2, "0");

export type Slot = { iso: string; display: string; sort: number };

/** Ближайшие даты по расписанию направления — как computeSlots на сайте (2 недели вперёд). */
export function computeSlots(slots: [number, string][]): Slot[] {
  const now = new Date();
  const res: Slot[] = [];
  slots.forEach(([wd, hm]) => {
    const [h, m] = hm.split(":").map(Number);
    let add = (wd - now.getDay() + 7) % 7;
    if (add === 0 && now.getHours() * 60 + now.getMinutes() >= h * 60 + m) add = 7;
    [0, 7].forEach((extra) => {
      const d = new Date(now); d.setDate(now.getDate() + add + extra); d.setHours(h, m, 0, 0);
      const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00+05:00`;
      const display = `${DAYS[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${pad(h)}:${pad(m)}`;
      res.push({ iso, display, sort: d.getTime() });
    });
  });
  return res.sort((a, b) => a.sort - b.sort);
}

export function gcalLink(title: string, isoStart: string) {
  const start = new Date(isoStart);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" + encodeURIComponent(title) +
    "&dates=" + fmt(start) + "/" + fmt(end) +
    "&details=" + encodeURIComponent("Пробное занятие в Shpigotskiy Art Space") +
    "&location=" + encodeURIComponent(STUDIO.address);
}

export type BookingPayload = {
  action: "book"; direction: string; ptype: "child" | "adult"; child: string; parent: string;
  phone: string; slot_display: string; slot_iso: string;
};
export type OnlinePayload = { action: "book_online"; title: string; name: string; phone: string };

/**
 * Отправить заявку. Если настроен сервер (BOOKING_WEBHOOK) — JSON туда,
 * иначе — готовое сообщение в WhatsApp студии.
 * Возвращает "server" | "whatsapp".
 */
export async function sendRequest(payload: BookingPayload | OnlinePayload, waText: string): Promise<"server" | "whatsapp"> {
  if (BOOKING_WEBHOOK) {
    try {
      const r = await fetch(BOOKING_WEBHOOK, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, source: "android_app" }),
      });
      if (r.ok) return "server";
    } catch {}
  }
  await openWhatsApp(waText);
  return "whatsapp";
}

/** Поле телефона всегда начинается с +7 (как на сайте). */
export function normalizePhone(v: string) {
  return v.startsWith("+7") ? v : "+7 " + v.replace(/^\+?7?\s?/, "");
}
export const phoneOk = (v: string) => v.replace(/\D/g, "").length >= 7;
export const fioOk = (v: string) => v.trim().split(/\s+/).filter(Boolean).length >= 2;
