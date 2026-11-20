"use client";

import { useEffect } from "react";
import { redirectIfLocked } from "@/lib/lock/client";

// Opplåsingen med koden varer en stund (12 timer som standard). Står appen åpen lenger, avviser serveren alt
// man prøver å lagre. Derfor sjekker appen når den kommer fram igjen (og hvert 10. minutt mens den er synlig),
// og sender til kodeskjermen før man begynner å skrive.

const EVERY_MS = 10 * 60_000;

export function LockGuard() {
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible") void redirectIfLocked();
    };
    document.addEventListener("visibilitychange", check);
    const timer = setInterval(check, EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", check);
      clearInterval(timer);
    };
  }, []);
  return null;
}
