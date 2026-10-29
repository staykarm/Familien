"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { VIEW_TITLES, type DashboardViewId } from "@/lib/dashboard/views";
import { useAutoRefresh } from "./Dashboard";
import { Clock, viewHref } from "./parts";

/** Undersidene i den rekkefølgen de står i menyen øverst. */
const NAV: DashboardViewId[] = ["dag", "vaer", "oppgaver", "handleliste", "kart", "lys", "varme", "persienner", "musikk", "strom", "sikkerhet", "roboter", "vanning"];

/** Ramme rundt en underside: «Oversikt» tilbake, tittel, snarveier til de andre undersidene og klokka. */
export function DashboardView({ view, children }: { view: DashboardViewId; children: ReactNode }) {
  useAutoRefresh();
  return (
    <div className="flex min-h-dvh flex-col gap-3 p-3">
      <header className="flex flex-wrap items-center gap-3 px-1">
        <Link href="/dashboard" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-sm font-semibold hover:border-ink-faint">
          <ArrowLeft size={16} aria-hidden />
          Oversikt
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">{VIEW_TITLES[view]}</h1>
        <nav aria-label="Andre deler" className="flex flex-1 flex-wrap gap-1">
          {NAV.filter((v) => v !== view).map((v) => (
            <Link key={v} href={viewHref(v)} className="rounded-md px-2 py-1 text-xs font-medium text-ink-light hover:bg-card hover:text-ink">
              {VIEW_TITLES[v]}
            </Link>
          ))}
        </nav>
        <Clock withDate={false} />
      </header>
      <main className="flex min-h-0 flex-1 flex-col gap-3">{children}</main>
    </div>
  );
}
