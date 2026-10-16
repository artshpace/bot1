// Настройки связи приложения с сайтом и сервером.

/**
 * Адрес сайта. Отсюда приложение берёт фото и видео (пути вида "media/...").
 * Если файла нет на сайте — вместо него показывается иконка.
 */
export const SITE_URL = "https://artshpace.kz/";

/**
 * База сайта artshpace.kz (Supabase). Те же значения, что в website/js/supa-config.js.
 * Это публичные ключи — данные защищены правилами доступа (RLS) в базе.
 * Через неё работают вход в личный кабинет, посещаемость, навыки и оценки.
 */
export const SUPABASE_URL = "https://wislternhhcaqdnvcbba.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_N2bSPrjCuUGYyhmXAfxbKg_-mP2bXnA";

/**
 * Адрес сервера для заявок (необязательно). Если указан — заявки на пробное
 * и онлайн-курсы отправляются туда POST-запросом в формате JSON (те же поля,
 * что сайт отправляет Telegram-боту). Если пусто — заявка уходит в WhatsApp.
 */
export const BOOKING_WEBHOOK = "";
