"use client";

import { useState, useTransition } from "react";
import { MapPin, Search } from "lucide-react";
import { searchPlaces, setWeatherLocation } from "@/actions/weather";
import { buttonPrimary, input } from "@/components/ui/styles";
import type { WeatherLocation } from "@/lib/weather/service";

export function WeatherLocationForm({ current }: { current: WeatherLocation }) {
  const [location, setLocation] = useState(current);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WeatherLocation[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function search(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await searchPlaces(query);
      setResults(res.results);
      if (res.message) setMessage(res.message);
    });
  }

  function choose(place: WeatherLocation) {
    startTransition(async () => {
      const res = await setWeatherLocation(place);
      setMessage(res.message);
      if (res.ok) {
        setLocation(place);
        setResults([]);
        setQuery("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2">
        <MapPin size={20} className="text-primary-dark" aria-hidden />
        <strong>{location.label}</strong>
        <span className="text-sm text-ink-faint">
          ({location.lat}, {location.lon})
        </span>
      </p>
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Søk adresse, f.eks. «Vardeveien 3 Oslo»"
          aria-label="Søk etter adresse"
          className={input}
        />
        <button className={`${buttonPrimary} shrink-0 px-4`} disabled={pending || query.trim().length < 2} aria-label="Søk">
          <Search size={20} aria-hidden />
        </button>
      </form>
      {results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map((r) => (
            <li key={`${r.lat},${r.lon},${r.label}`}>
              <button
                onClick={() => choose(r)}
                disabled={pending}
                className="flex min-h-12 w-full items-center gap-2 rounded-2xl bg-card-soft px-4 text-left font-semibold hover:bg-primary-soft"
              >
                <MapPin size={16} aria-hidden /> {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && <p className="text-sm font-semibold text-ink-light">{message}</p>}
      <p className="text-xs text-ink-faint">Adresser fra Kartverket. Værdata fra Yr / MET Norway.</p>
    </div>
  );
}
