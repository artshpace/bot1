import { useEffect, useRef } from "react";
import { useAccount } from "../lib/account";
import { syncPayload, useProgress, type State } from "../lib/progress";
import { supabase } from "../lib/supabase";

/**
 * Сохраняет игровой прогресс в базе сайта (таблица game_progress, миграция 0032),
 * когда ученик вошёл в кабинет. Если таблицы ещё нет — молча работает только на телефоне.
 */
export function GameSync() {
  const { session } = useAccount();
  const { state, ready, mergeRemote } = useProgress();
  const uid = session?.user.id;
  const pulled = useRef<string | null>(null);
  /** писать в базу можно только после того, как подтянули сохранённое */
  const merged = useRef<string | null>(null);
  const disabled = useRef(false);

  // при входе — подтянуть сохранённый прогресс и слить с локальным
  useEffect(() => {
    if (!ready || !uid || pulled.current === uid) return;
    pulled.current = uid;
    disabled.current = false;
    supabase.from("game_progress").select("data").eq("user_id", uid).maybeSingle().then(({ data, error }) => {
      if (error) { disabled.current = true; return; }
      if (data?.data) mergeRemote(data.data as Partial<State>);
      merged.current = uid;
    });
  }, [ready, uid]);

  // после изменений — сохранить (с задержкой, чтобы не писать на каждое нажатие)
  useEffect(() => {
    if (!ready || !uid || merged.current !== uid || disabled.current) return;
    const t = setTimeout(() => {
      supabase.from("game_progress")
        .upsert({ user_id: uid, data: syncPayload(state), updated_at: new Date().toISOString() })
        .then(({ error }) => { if (error) disabled.current = true; });
    }, 2500);
    return () => clearTimeout(t);
  }, [state, ready, uid]);

  return null;
}
