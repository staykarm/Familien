// Generert fra metno/weathericons legend.csv (MIT, © Yr). Norske navn på værsymbolene.
export const SYMBOL_LABELS: Record<string, string> = {
  clearsky: "Klarvær",
  fair: "Lettskyet",
  partlycloudy: "Delvis skyet",
  cloudy: "Skyet",
  lightrainshowers: "Lette regnbyger",
  rainshowers: "Regnbyger",
  heavyrainshowers: "Kraftige regnbyger",
  lightrainshowersandthunder: "Lette regnbyger og torden",
  rainshowersandthunder: "Regnbyger og torden",
  heavyrainshowersandthunder: "Kraftige regnbyger og torden",
  lightsleetshowers: "Lette sluddbyger",
  sleetshowers: "Sluddbyger",
  heavysleetshowers: "Kraftige sluddbyger",
  lightssleetshowersandthunder : "Lette sluddbyger og torden",
  sleetshowersandthunder: "Sluddbyger og torden",
  heavysleetshowersandthunder: "Kraftige sluddbyger og torden",
  lightsnowshowers: "Lette snøbyger",
  snowshowers: "Snøbyger",
  heavysnowshowers: "Kraftige snøbyger",
  lightssnowshowersandthunder: "Lette snøbyger og torden",
  snowshowersandthunder: "Snøbyger og torden",
  heavysnowshowersandthunder: "Kraftige snøbyger og torden",
  lightrain: "Lett regn",
  rain: "Regn",
  heavyrain: "Kraftig regn",
  lightrainandthunder: "Lett regn og torden",
  rainandthunder: "Regn og torden",
  heavyrainandthunder: "Kraftig regn og torden",
  lightsleet: "Lett sludd",
  sleet: "Sludd",
  heavysleet: "Kraftig sludd",
  lightsleetandthunder: "Lett sludd og torden",
  sleetandthunder: "Sludd og torden",
  heavysleetandthunder: "Kraftig sludd og torden",
  lightsnow: "Lett snø",
  snow: "Snø",
  heavysnow: "Kraftig snø",
  lightsnowandthunder: "Lett snø og torden",
  snowandthunder: "Snø og torden",
  heavysnowandthunder: "Kraftig snø og torden",
  fog: "Tåke",
};

/** «rain_day» → «Regn». Ukjente koder gir null. */
export function symbolLabel(symbolCode: string | null | undefined): string | null {
  if (!symbolCode) return null;
  return SYMBOL_LABELS[symbolCode.replace(/_(day|night|polartwilight)$/, "")] ?? null;
}

/** Sti til Yr sitt offisielle symbol, servert fra public/weather. */
export function symbolUrl(symbolCode: string): string {
  return `/weather/${symbolCode}.svg`;
}
