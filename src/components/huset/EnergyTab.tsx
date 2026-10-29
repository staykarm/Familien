"use client";

import { useEffect, useState } from "react";
import { BatteryCharging, Car, Plug, Zap } from "lucide-react";
import { loadPrices } from "@/actions/huset";
import { cheapestWindow, kr, levelOf, watt, windowLabel, type Energy, type PriceLevel, type PricePoint } from "@/lib/huset/energy";

// Strøm (Tibber): pris nå, effekt, forbruk og kostnad, timepriser for i dag og i morgen, og elbilene.

/** Prisene hentes på nytt så ofte (de endrer seg bare én gang i døgnet). */
const PRICE_REFRESH_MS = 15 * 60_000;

export const LEVEL_COLOR: Record<PriceLevel, string> = { billig: "#2e9d57", normal: "#d89b00", dyr: "#d92d20" };
export const LEVEL_TEXT: Record<PriceLevel, string> = { billig: "billig nå", normal: "normal pris", dyr: "dyrt nå" };

/** Timeprisene for i dag og i morgen, og klokka da de sist ble hentet (for «nå»-markøren). */
export function usePrices(): { hours: PricePoint[]; now: Date | null } {
  const [state, setState] = useState<{ hours: PricePoint[]; now: Date | null }>({ hours: [], now: null });
  useEffect(() => {
    let alive = true;
    const load = () =>
      loadPrices()
        .then((hours) => alive && setState({ hours, now: new Date() }))
        .catch(() => {});
    void load();
    const timer = setInterval(load, PRICE_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return state;
}

const hourOf = (iso: string) => iso.slice(11, 13);

/**
 * Søyler per time: grønn = billig, gul = normal, rød = dyr (i forhold til timene som vises). Timen vi er i,
 * har mørk kant, og de tre billigste timene fram i tid er streket under.
 */
export function PriceChart({ hours, now, compact = false }: { hours: PricePoint[]; now: Date | null; compact?: boolean }) {
  if (!hours.length || !now) return <p className="text-xs text-ink-light">{now ? "Fant ikke strømprisene." : "Henter strømprisene …"}</p>;
  const from = now.getTime() - 60 * 60_000;
  const shown = compact ? hours.filter((h) => Date.parse(h.start) > from).slice(0, 24) : hours;
  const prices = shown.map((h) => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const best = cheapestWindow(hours, now, 3);
  const inBest = (h: PricePoint) => !!best && Date.parse(h.start) >= Date.parse(best.start) && Date.parse(h.start) < Date.parse(best.end);
  const isNow = (h: PricePoint) => Date.parse(h.start) <= now.getTime() && now.getTime() < Date.parse(h.start) + 60 * 60_000;
  const every = compact ? 6 : 3;
  // Søylene starter litt under laveste pris, så forskjellene synes.
  const floor = Math.max(0, min - (max - min) * 0.6);
  const height = (p: number) => `${Math.max(6, ((p - floor) / (max - floor || 1)) * 100)}%`;
  return (
    <figure className="flex flex-col gap-1" aria-label={`Strømpris per time, fra ${kr(min)} til ${kr(max)} per kWh`}>
      <div className={`flex items-end gap-px ${compact ? "h-12" : "h-36"}`}>
        {shown.map((h) => (
          <div
            key={h.start}
            title={`kl. ${hourOf(h.start)}: ${kr(h.price)}/kWh`}
            className={`flex-1 rounded-t-sm ${isNow(h) ? "outline-2 outline-ink" : ""}`}
            style={{ height: height(h.price), background: LEVEL_COLOR[levelOf(h.price, min, max)], opacity: isNow(h) ? 1 : 0.6 }}
          />
        ))}
      </div>
      <div className="flex gap-px" aria-hidden>
        {shown.map((h, i) => (
          <div key={h.start} className="flex flex-1 flex-col items-center">
            <span className={`h-0.5 w-full ${inBest(h) ? "bg-[#2e9d57]" : ""}`} />
            <span className={`h-3 text-[0.6rem] leading-3 tabular-nums text-ink-light ${hourOf(h.start) === "00" ? "font-bold" : ""}`}>{i % every === 0 || hourOf(h.start) === "00" ? hourOf(h.start) : ""}</span>
          </div>
        ))}
      </div>
      {best && (
        <figcaption className="text-xs text-ink-light">
          Billigst de neste timene: <span className="font-semibold text-ink">kl. {windowLabel(best)}</span> ({kr(best.avg)}/kWh)
        </figcaption>
      )}
    </figure>
  );
}

const panel = "rounded-2xl bg-card px-3 py-2 shadow-[0_2px_12px_rgba(120,90,60,0.08)]";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-ink-light">{label}</span>
      <span className="text-lg font-bold tabular-nums">{value}</span>
      {sub && <span className="text-xs text-ink-light">{sub}</span>}
    </div>
  );
}

/** Elbilene: batteri, mål, rekkevidde og om de lader. */
export function CarList({ energy }: { energy: Energy }) {
  if (!energy.cars.length) return null;
  return (
    <ul className="flex flex-col">
      {energy.cars.map((c) => (
        <li key={c.id} className={`flex items-center gap-3 border-b border-line py-2 last:border-0 ${c.online ? "" : "opacity-50"}`}>
          <Car size={18} className="shrink-0 text-ink-light" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold wrap-break-word">{c.name}</p>
            <p className="text-xs text-ink-light">
              {!c.online ? "Ikke tilkoblet" : [c.rangeKm !== null ? `${c.rangeKm} km` : "", c.target !== null ? `mål ${c.target} %` : ""].filter(Boolean).join(" · ")}
            </p>
          </div>
          {c.charging && <BatteryCharging size={16} className="text-[#2e9d57]" aria-label="Lader" />}
          {!c.charging && c.plugged && <Plug size={16} className="text-ink-light" aria-label="Plugget inn" />}
          {c.battery !== null && (
            <span className="flex w-24 items-center gap-1.5">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <span className="block h-full rounded-full bg-[#2e9d57]" style={{ width: `${c.battery}%` }} />
              </span>
              <span className="w-9 text-right text-xs font-semibold tabular-nums">{c.battery} %</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Strøm-fanen i Huset. */
export function EnergyTab({ energy }: { energy: Energy }) {
  const { hours, now } = usePrices();
  if (energy.price === null && !energy.cars.length) return <p className="text-sm text-ink-light">Fant ikke Tibber i Home Assistant.</p>;
  return (
    <div className="flex flex-col gap-2">
      <section className={`${panel} grid grid-cols-2 gap-3 py-3 sm:grid-cols-4`} aria-label="Strøm nå">
        <Stat
          label="Pris nå"
          value={energy.price === null ? "–" : `${kr(energy.price)}`}
          sub={energy.level ? `per kWh · ${LEVEL_TEXT[energy.level]}` : "per kWh"}
        />
        <Stat label="Effekt nå" value={watt(energy.powerW)} sub={energy.hourKwh !== null ? `denne timen ca. ${energy.hourKwh.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} kWh` : undefined} />
        <Stat label="I dag" value={kr(energy.todayCost, 0)} sub={energy.todayKwh !== null ? `${energy.todayKwh.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} kWh` : undefined} />
        <Stat label="Denne måneden" value={kr(energy.monthCost, 0)} sub={energy.monthKwh !== null ? `${Math.round(energy.monthKwh).toLocaleString("nb-NO")} kWh` : undefined} />
      </section>
      <section className={panel} aria-label="Strømpris time for time">
        <h3 className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-ink-light">
          <Zap size={12} aria-hidden /> Strømpris time for time{hours.length > 24 ? " (i dag og i morgen)" : ""}
        </h3>
        <PriceChart hours={hours} now={now} />
        {energy.min !== null && (
          <p className="text-xs text-ink-light">
            I dag: laveste {kr(energy.min)}, snitt {kr(energy.avg)}, høyeste {kr(energy.max)} per kWh. Morgendagens priser kommer ved 13-tiden.
          </p>
        )}
      </section>
      {energy.cars.length > 0 && (
        <section className={panel} aria-label="Elbiler">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-light">Elbiler</h3>
          <CarList energy={energy} />
        </section>
      )}
    </div>
  );
}
