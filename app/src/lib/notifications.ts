import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { DATA, type DirKey } from "../data/content";
import type { UpcomingLesson } from "./schedule";

/* Напоминания работают прямо на телефоне — сервер для них не нужен. */

export type Prefs = { lessons: boolean; quests: boolean };
const KEY = "artspace_prefs_v1";
const CHANNEL = "reminders";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function loadPrefs(): Promise<Prefs> {
  try { const raw = await AsyncStorage.getItem(KEY); if (raw) return { lessons: false, quests: false, ...JSON.parse(raw) }; } catch {}
  return { lessons: false, quests: false };
}
export async function savePrefs(p: Prefs) { try { await AsyncStorage.setItem(KEY, JSON.stringify(p)); } catch {} }

/** Спросить разрешение (Android 13+ показывает системный запрос). */
export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: "Напоминания о занятиях", importance: Notifications.AndroidImportance.HIGH });
  }
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

const HOURS_BEFORE = 2;

/** Перепланировать все напоминания: за 2 часа до занятий и задания дня в 18:00. */
export async function reschedule(prefs: Prefs, lessons: UpcomingLesson[]) {
  if (Platform.OS === "web") return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!prefs.lessons && !prefs.quests) return;
  if (!(await ensurePermission())) return;

  if (prefs.lessons) {
    const now = Date.now();
    for (const l of lessons.slice(0, 40)) {
      const when = l.at.getTime() - HOURS_BEFORE * 3600000;
      if (when <= now + 60000) continue;
      const dir = DATA[l.direction as DirKey]?.title ?? l.direction;
      await Notifications.scheduleNotificationAsync({
        content: { title: `Сегодня в ${l.start} — ${dir}`, body: `${l.group} · ${l.student}. Не опаздывайте — ждём в студии!` },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL },
      });
    }
  }
  if (prefs.quests) {
    await Notifications.scheduleNotificationAsync({
      content: { title: "Задания дня ждут 🔥", body: "Три коротких задания — и навыки растут. Не прерывай серию!" },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 18, minute: 0, channelId: CHANNEL },
    });
  }
}
