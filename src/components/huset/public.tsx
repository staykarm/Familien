import Link from "next/link";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { card } from "@/components/ui/styles";
import type { HouseSummary } from "@/lib/huset/public";
import { HouseStatusRows } from "./HouseStatus";

// Det resten av Familien får bruke fra Huset (visning). Serverdelen ligger i lib/huset/public.ts.

/** «Huset nå» på «I dag»: feil som trenger oppmerksomhet, og de samme linjene som på dashboardet. Trykk åpner fanen i Huset. */
export function HouseSummaryCard({ summary }: { summary: HouseSummary }) {
  return (
    <section className={`${card} flex flex-col gap-2`}>
      <h2 className="font-display text-lg font-bold sm:text-xl">🏠 Huset nå</h2>
      {/* Det som haster, står øverst som på dashboardet. Resten av feilene står rødt i linjene under. */}
      {summary.alerts
        .filter((a) => a.startsWith("Brannalarm") || a.startsWith("Innbrudd"))
        .map((a) => (
          <p key={a} className="flex items-start gap-1.5 rounded-2xl bg-danger px-3 py-2 text-sm font-bold text-white" role="alert">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
            {a}
          </p>
        ))}
      <HouseStatusRows rows={summary.rows} playing={summary.playing} base="/huset?fane=" />
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
export { HouseQuickLights, HouseStatusList, useHouseLive, type HouseLive } from "./DashboardHouse";
export { HouseChips, HouseStatusRows } from "./HouseStatus";
export type { StatusArea } from "@/lib/huset/dashboard";
export { CarList, LEVEL_COLOR, LEVEL_TEXT, PriceChart, usePrices } from "./EnergyTab";
export { SafetyBanner } from "./SafetyTab";
export { kr, watt } from "@/lib/huset/energy";
