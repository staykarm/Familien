"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// En liste som bare viser så mange rader som får plass i høyden den får, og «+N til» for resten.
// Brukes på dashboardet, der kortene har fast høyde og innholdet aldri skal kuttes midt i en rad.

const MORE_PX = 18;

export function FitList<T>({
  items,
  keyOf,
  render,
  weight = () => 1,
  more = (n) => `+${n} til`,
  className = "",
}: {
  items: T[];
  /** Fast nøkkel per rad: lista måles bare på nytt når innholdet endres, ikke ved hver tegning. */
  keyOf: (item: T) => string;
  render: (item: T, index: number) => ReactNode;
  /** Hvor mye hver rad teller i «+N til» (f.eks. antall avtaler for en person). */
  weight?: (item: T) => number;
  more?: (hidden: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  // Først tegnes alt (måling), så bare det som får plass.
  // Lista måles på nytt når innholdet endres (nøklene), ikke ved hver tegning.
  const signature = items.map(keyOf).join("|");
  const [fit, setFit] = useState({ signature, count: items.length, measuring: true });
  if (fit.signature !== signature) setFit({ signature, count: items.length, measuring: true });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !fit.measuring) return;
    const kids = Array.from(el.children).filter((c) => !(c as HTMLElement).dataset.more) as HTMLElement[];
    const height = el.clientHeight;
    const top = el.getBoundingClientRect().top;
    const bottom = (k: HTMLElement) => k.getBoundingClientRect().bottom - top;
    let count = kids.length;
    if (kids.length && bottom(kids[kids.length - 1]) > height + 1) {
      count = kids.filter((k) => bottom(k) <= height - MORE_PX).length;
    }
    setFit((f) => ({ ...f, count, measuring: false }));
  }, [fit.measuring]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let last = el.clientHeight;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientHeight - last) < 2) return;
      last = el.clientHeight;
      setFit((f) => ({ ...f, count: items.length, measuring: true }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length]);

  const shown = fit.measuring ? items : items.slice(0, fit.count);
  const hidden = fit.measuring ? 0 : items.slice(fit.count).reduce((sum, i) => sum + weight(i), 0);
  return (
    <ul ref={ref} className={`flex min-h-0 flex-1 flex-col overflow-hidden ${className}`}>
      {shown.map(render)}
      {hidden > 0 && (
        <li data-more="1" className="pt-0.5 text-xs text-ink-light">
          {more(hidden)}
        </li>
      )}
    </ul>
  );
}
