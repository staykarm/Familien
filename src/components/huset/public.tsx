import Link from "next/link";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { card } from "@/components/ui/styles";
import type { HouseSummary } from "@/lib/huset/public";

// Det resten av Familien får bruke fra Huset (visning). Serverdelen ligger i lib/huset/public.ts.

/** «Huset nå» på «I dag»: rommene der noe er på, og feil som trenger oppmerksomhet. Ett trykk åpner Huset. */
export function HouseSummaryCard({ summary }: { summary: HouseSummary }) {
  return (
    <section className={`${card} flex flex-col gap-2`}>
      <h2 className="font-display text-lg font-bold sm:text-xl">🏠 Huset nå</h2>
      {summary.alerts.map((a) => (
        <p key={a} className="flex items-start gap-1.5 text-sm font-semibold text-danger">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
          {a}
        </p>
      ))}
      {summary.lines.length === 0 ? (
        <p className="text-ink-light">Alt er av, og ingenting spiller.</p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-sm">
          {summary.lines.map((l) => (
            <li key={l.name} className="wrap-break-word">
              <strong>{l.name}:</strong> {l.parts.join(", ")}
            </li>
          ))}
        </ul>
      )}
      <Link href="/huset" className="flex items-center gap-1 self-end text-sm font-bold text-primary-dark">
        Til Huset <ChevronRight size={16} aria-hidden />
      </Link>
    </section>
  );
}

/** «Si det»: hvor beskjeden skal, og svaret når den gjaldt huset. */
export { routeVoiceText } from "@/actions/huset";
export { HouseVoiceReply } from "./HouseVoiceReply";

/** Dashboardet: Huset i små biter, hele fanene som undersider og «Spør» med familien i tillegg. */
export { HousePage, type HouseTab } from "./HousePage";
export { HouseAgent } from "./HouseAgent";
export { HouseMiniMap, HouseNowPlaying, HouseQuickLights, HouseStatusList, useHouseLive, type HouseLive } from "./DashboardHouse";
export type { StatusArea } from "@/lib/huset/dashboard";
