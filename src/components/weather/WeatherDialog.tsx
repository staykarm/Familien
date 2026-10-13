"use client";

import { Droplets, Wind } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { buttonPrimary } from "@/components/ui/styles";
import { osloDate } from "@/lib/calendar/dates";
import { symbolLabel } from "@/lib/weather/symbols";
import type { DailyWeather, HourlyWeather } from "@/lib/weather/yr";
import { formatTemp, WeatherIcon, YrCredit } from "./WeatherBadge";

interface Props {
  day: DailyWeather;
  hours: HourlyWeather[];
  locationLabel: string;
  onClose: () => void;
}

/** Time-for-time-varsel for én dag. */
export function WeatherDialog({ day, hours, locationLabel, onClose }: Props) {
  const title = osloDate(day.date).setLocale("nb").toFormat("cccc d. LLLL");
  return (
    <Sheet
      title={`Været ${title}`}
      onClose={onClose}
      onSubmit={onClose}
      footer={
        <>
          <YrCredit />
          <button className={`${buttonPrimary} ml-auto`}>Lukk</button>
        </>
      }
    >
      <div className="flex items-center gap-4 rounded-2xl bg-sky/50 p-4">
        <WeatherIcon code={day.symbolCode} size={64} />
        <div>
          <p className="font-display text-3xl font-bold">
            {formatTemp(day.tempMax)} <span className="text-xl text-ink-light">/ {formatTemp(day.tempMin)}</span>
          </p>
          <p className="font-semibold">{symbolLabel(day.symbolCode) ?? ""}</p>
          <p className="text-sm text-ink-light">
            {day.precipitationMm !== null && `${day.precipitationMm} mm · `}
            {day.windMax !== null && `vind opptil ${Math.round(day.windMax)} m/s`}
          </p>
          <p className="text-xs text-ink-faint">{locationLabel}</p>
        </div>
      </div>

      {hours.length === 0 ? (
        <p className="text-ink-light">Ikke noe timesvarsel for denne dagen ennå.</p>
      ) : (
        <ul className="divide-y-2 divide-line">
          {hours.map((h) => {
            const end = (h.hour + h.hours) % 24;
            return (
              <li key={h.time} className="grid grid-cols-[4.5rem_2.5rem_3rem_1fr_auto] items-center gap-2 py-2">
                <span className="font-bold tabular-nums">
                  {String(h.hour).padStart(2, "0")}
                  {h.hours > 1 && <span className="text-xs text-ink-light">–{String(end).padStart(2, "0")}</span>}
                </span>
                <WeatherIcon code={h.symbolCode} size={36} />
                <span className={`font-extrabold tabular-nums ${(h.temp ?? 0) > 0 ? "text-[#c60000]" : "text-[#0062ba]"}`}>
                  {formatTemp(h.temp)}
                </span>
                <span className="flex items-center gap-1 text-sm text-[#0062ba]">
                  {h.precipitationMm ? (
                    <>
                      <Droplets size={14} aria-hidden /> {h.precipitationMm} mm
                    </>
                  ) : null}
                </span>
                <span className="flex items-center gap-1 text-sm text-ink-light">
                  <Wind size={14} aria-hidden /> {h.windSpeed === null ? "–" : Math.round(h.windSpeed)} m/s
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
