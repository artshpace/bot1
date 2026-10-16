import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/* Публичные данные сайта artshpace.kz, которые администратор ведёт в кабинете. */

export type MediaItem = { id: string; subsection: string | null; title: string | null; kind: "image" | "video" | "embed" | "file"; url: string; thumb_url: string | null };
export type StudioAchievement = {
  id: string; category: string; title: string; description: string | null; direction: string | null;
  participant_name: string | null; event_date: string; photo_url: string | null; featured: boolean;
};

function useQuery<T>(run: () => PromiseLike<{ data: T[] | null; error: unknown }>): { data: T[] | null; failed: boolean } {
  const [data, setData] = useState<T[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.resolve(run()).then(
      (r) => { if (alive) { if (r.error) setFailed(true); else setData(r.data ?? []); } },
      () => { if (alive) setFailed(true); },
    );
    return () => { alive = false; };
  }, []);
  return { data, failed };
}

export const useGalleryItems = () =>
  useQuery<MediaItem>(() => supabase.from("media_items").select("id,subsection,title,kind,url,thumb_url")
    .eq("section", "gallery").eq("active", true).in("kind", ["image", "video"]).order("sort").limit(60));

export const useStudioAchievements = () =>
  useQuery<StudioAchievement>(() => supabase.from("studio_achievements")
    .select("id,category,title,description,direction,participant_name,event_date,photo_url,featured")
    .eq("active", true).order("event_date", { ascending: false }).limit(50));
