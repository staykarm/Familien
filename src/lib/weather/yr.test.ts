import { describe, expect, it } from "vitest";
import { normalizeDaily, normalizeHourly, roundCoord, type YrTimeseriesEntry } from "./yr";
import { symbolLabel } from "./symbols";

/** Bygger et lite «compact»-svar: timesdata fra start, deretter 6-timersblokker. */
function fixture(): { properties: { timeseries: YrTimeseriesEntry[] } } {
  const ts: YrTimeseriesEntry[] = [];
  // 13. okt 2026 kl. 20 UTC (22 Oslo) til 14. okt 04 UTC: timesverdier.
  for (let h = 0; h < 8; h++) {
    const time = new Date(Date.UTC(2026, 9, 13, 20 + h)).toISOString().replace(".000", "");
    ts.push({
      time,
      data: {
        instant: { details: { air_temperature: 5 + h, wind_speed: 2 + h / 10 } },
        next_1_hours: { summary: { symbol_code: "rain" }, details: { precipitation_amount: 0.5 } },
        next_6_hours: { summary: { symbol_code: "cloudy" }, details: { precipitation_amount: 3 } },
      },
    });
  }
  // Deretter 6-timersblokker 14. okt 06, 12, 18 UTC.
  for (const h of [6, 12, 18]) {
    ts.push({
      time: new Date(Date.UTC(2026, 9, 14, h)).toISOString().replace(".000", ""),
      data: {
        instant: { details: { air_temperature: h, wind_speed: 4 } },
        next_6_hours: { summary: { symbol_code: h === 12 ? "partlycloudy_day" : "cloudy" }, details: { precipitation_amount: 1 } },
      },
    });
  }
  return { properties: { timeseries: ts } };
}

describe("normalizeHourly", () => {
  it("bruker timesdata så lenge de finnes og deretter 6-timersblokker, i Oslo-tid", () => {
    const rows = normalizeHourly(fixture());
    expect(rows[0]).toMatchObject({ date: "2026-10-13", hour: 22, hours: 1, symbolCode: "rain", temp: 5 });
    expect(rows.filter((r) => r.hours === 1)).toHaveLength(8);
    expect(rows.filter((r) => r.hours === 6).map((r) => r.hour)).toEqual([8, 14, 20]);
  });
});

describe("normalizeDaily", () => {
  it("summerer nedbør uten dobbelttelling og velger symbolet nærmest kl. 12", () => {
    const days = normalizeDaily(fixture());
    expect(days.map((d) => d.date)).toEqual(["2026-10-13", "2026-10-14"]);
    const d14 = days[1];
    // 6 timesverdier à 0,5 (00–05 Oslo) + 3 blokker à 1
    expect(d14.precipitationMm).toBe(6);
    expect(d14.symbolCode).toBe("partlycloudy_day");
    expect(d14.tempMax).toBe(18);
    expect(d14.tempMin).toBe(6);
  });

  it("tåler tomt svar", () => {
    expect(normalizeDaily({})).toEqual([]);
  });
});

describe("hjelpere", () => {
  it("runder koordinater til 4 desimaler", () => {
    expect(roundCoord(59.913312345)).toBe(59.9133);
    expect(roundCoord(10.73891)).toBe(10.7389);
  });

  it("gir norske navn på symboler", () => {
    expect(symbolLabel("rain")).toBe("Regn");
    expect(symbolLabel("partlycloudy_night")).toBe("Delvis skyet");
    expect(symbolLabel("ukjent")).toBeNull();
  });
});
