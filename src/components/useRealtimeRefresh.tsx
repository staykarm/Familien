"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const POLL_MS = 30_000;

/**
 * Holder data oppdatert på alle skjermer. Serveren sender et «endret»-signal på en Realtime-kanal
 * etter hver endring; da kaller vi `onChange` (som henter på nytt via en server action).
 * Reserve: også når appen kommer i forgrunnen, og hvert 30. sekund mens den er synlig.
 */
export function useRealtimeRefresh(
  topic: string,
  onChange: (payload: Record<string, unknown> | null) => void
): { live: boolean } {
  const [live, setLive] = useState(false);
  const ref = useRef(onChange);
  useEffect(() => {
    ref.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(topic)
      .on("broadcast", { event: "changed" }, (msg) => ref.current((msg.payload as Record<string, unknown>) ?? null))
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    const onVisible = () => {
      if (document.visibilityState === "visible") ref.current(null);
    };
    document.addEventListener("visibilitychange", onVisible);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") ref.current(null);
    }, POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [topic]);

  return { live };
}

export function LiveBadge({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
        live ? "bg-mint text-ink" : "bg-card-soft text-ink-light"
      }`}
      title={live ? "Endringer vises med en gang på alle skjermer" : "Kobler til … oppdateres likevel jevnlig"}
    >
      <span className={`h-2 w-2 rounded-full ${live ? "bg-[#2e9e5b]" : "bg-ink-faint"}`} />
      {live ? "Live" : "Kobler til"}
    </span>
  );
}
