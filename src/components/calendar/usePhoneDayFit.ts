"use client";

import { useEffect, useState, type RefObject } from "react";

/** Under denne bredden har appen bunnmeny (samme grense som `md` i AppShell). */
const PHONE_QUERY = "(max-width: 767px)";
/** Tidsrommet som skal synes uten å rulle på telefon. */
export const FIT_FIRST_HOUR = 8;
export const FIT_HOURS = 12;

/**
 * Dagvisning på telefon: kalenderen fyller resten av skjermen (over bunnmenyen) og ruller inni seg selv,
 * slik at 08–20 synes med en gang. Returnerer høyden i px, eller null på større skjermer.
 */
export function usePhoneDayFit(ref: RefObject<HTMLElement | null>, enabled: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const mq = window.matchMedia(PHONE_QUERY);
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = ref.current;
        if (!mq.matches || !el) return setHeight(null);
        const top = el.getBoundingClientRect().top + window.scrollY;
        const nav = document.querySelector("[data-bottom-nav]")?.getBoundingClientRect().height ?? 0;
        const viewport = window.visualViewport?.height ?? window.innerHeight;
        setHeight(Math.max(320, Math.floor(viewport - top - nav - 8)));
      });
    };
    measure();
    // Innhold over kalenderen (f.eks. værstripen) kan komme litt senere og flytte den ned.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    mq.addEventListener("change", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      mq.removeEventListener("change", measure);
    };
  }, [ref, enabled]);

  return enabled ? height : null;
}
