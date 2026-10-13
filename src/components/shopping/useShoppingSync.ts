"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const TOPIC = "familien-handleliste";
const POLL_MS = 30_000;

/**
 * Holder handlelisten oppdatert på alle skjermer.
 * Serveren sender et «endret»-signal på en Realtime-kanal etter hver endring; da henter vi listen på nytt.
 * I tillegg hentes den når appen kommer i forgrunnen, og hvert 30. sekund som reserve hvis kanalen faller ut.
 */
export function useShoppingSync(refetch: () => void): { live: boolean } {
  const [live, setLive] = useState(false);
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(TOPIC)
      .on("broadcast", { event: "changed" }, () => refetchRef.current())
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    const onVisible = () => {
      if (document.visibilityState === "visible") refetchRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refetchRef.current();
    }, POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, []);

  return { live };
}
