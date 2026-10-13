/* eslint-disable @next/next/no-img-element -- små statiske SVG-er fra public/weather */
import { symbolLabel, symbolUrl } from "@/lib/weather/symbols";
import type { DailyWeather } from "@/lib/weather/yr";

export function WeatherIcon({ code, size = 28 }: { code: string | null; size?: number }) {
  if (!code) return null;
  const label = symbolLabel(code) ?? "";
  return <img src={symbolUrl(code)} alt={label} title={label} width={size} height={size} className="inline-block shrink-0" />;
}

export function formatTemp(t: number | null): string {
  return t === null ? "–" : `${Math.round(t)}°`;
}

/** Dagssymbol + maks-temperatur. Rød for pluss, blå for minus – som på Yr. */
export function WeatherBadge({ day, size = 24, onClick }: { day: DailyWeather; size?: number; onClick?: () => void }) {
  const warm = (day.tempMax ?? 0) > 0;
  const content = (
    <>
      <WeatherIcon code={day.symbolCode} size={size} />
      <span className={`text-xs font-extrabold tabular-nums ${warm ? "text-[#c60000]" : "text-[#0062ba]"}`}>
        {formatTemp(day.tempMax)}
      </span>
    </>
  );
  if (!onClick) return <span className="inline-flex items-center gap-0.5">{content}</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-0.5 rounded-full px-1 hover:bg-sky/60"
      aria-label={`Værvarsel ${day.date}`}
    >
      {content}
    </button>
  );
}

export function YrCredit() {
  return (
    <p className="text-center text-xs text-ink-light">
      Værdata fra{" "}
      <a href="https://www.yr.no" target="_blank" rel="noreferrer" className="font-bold underline underline-offset-2">
        Yr
      </a>{" "}
      /{" "}
      <a href="https://www.met.no" target="_blank" rel="noreferrer" className="underline underline-offset-2">
        MET Norway
      </a>
    </p>
  );
}
