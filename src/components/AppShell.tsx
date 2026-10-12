"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ListChecks, Settings, ShoppingBasket, Users } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Kalender", icon: CalendarDays },
  { href: "/oppgaver", label: "Oppgaver", icon: ListChecks },
  { href: "/handleliste", label: "Handleliste", icon: ShoppingBasket },
  { href: "/profiler", label: "Familien", icon: Users },
  { href: "/innstillinger", label: "Innstillinger", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Bunnmeny på mobil, sidemeny på nettbrett/PC. `me` er avataren til den som bruker appen nå. */
export function AppShell({ children, me }: { children: ReactNode; me: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-2 border-r-2 border-line bg-card-soft p-4 md:flex">
        <div className="mb-4 flex items-center justify-between px-2">
          <span className="font-display text-2xl font-bold text-primary-dark">Familien</span>
          {me}
        </div>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex min-h-12 items-center gap-3 rounded-2xl px-4 text-lg font-bold transition ${
              isActive(pathname, href) ? "bg-primary text-white shadow-sm" : "text-ink hover:bg-primary-soft"
            }`}
          >
            <Icon size={24} aria-hidden />
            {label}
          </Link>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between bg-background/90 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
          <span className="font-display text-2xl font-bold text-primary-dark">Familien</span>
          {me}
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-2 md:px-8 md:pb-10 md:pt-8">{children}</main>
      </div>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-card md:hidden">
        <ul className="grid grid-cols-5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${
                    active ? "text-primary-dark" : "text-ink-light"
                  }`}
                >
                  <span className={`rounded-full px-4 py-1 ${active ? "bg-primary-soft" : ""}`}>
                    <Icon size={24} aria-hidden />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
