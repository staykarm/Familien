"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FileUp, ListChecks, NotebookPen, Settings, ShoppingBasket, Users } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Kalender", icon: CalendarDays },
  { href: "/oppgaver", label: "Oppgaver", icon: ListChecks },
  { href: "/handleliste", label: "Handle", icon: ShoppingBasket, long: "Handleliste" },
  { href: "/notater", label: "Notater", icon: NotebookPen },
  { href: "/profiler", label: "Familien", icon: Users },
];

/** Sekundære sider: nederst i sidemenyen og som ikoner i toppen på telefon. */
const EXTRA = [
  { href: "/filer", label: "Les inn fil", icon: FileUp },
  { href: "/innstillinger", label: "Innstillinger", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Tre oppsett etter skjermbredde:
 * - telefon (< md): kompakt topplinje + bunnmeny
 * - nettbrett på høykant (md–lg): smal ikonmeny til venstre
 * - nettbrett på tvers / PC (≥ lg): full sidemeny med tekst
 * `me` er avataren til den som bruker appen nå (lenker til «Hvem er jeg?»).
 */
export function AppShell({ children, me }: { children: ReactNode; me: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="sticky top-0 hidden h-dvh w-20 shrink-0 flex-col items-center gap-1 border-r-2 border-line bg-card-soft px-2 py-3 md:flex lg:w-60 lg:items-stretch lg:p-4">
        <div className="mb-3 flex flex-col items-center gap-2 lg:flex-row lg:justify-between lg:px-2">
          <span className="font-display text-lg font-bold text-primary-dark lg:text-2xl">
            <span className="lg:hidden" aria-hidden>
              🏡
            </span>
            <span className="hidden lg:inline">Familien</span>
          </span>
          {me}
        </div>
        {[...NAV, ...EXTRA].map(({ href, label, icon: Icon, ...rest }, i) => {
          const active = isActive(pathname, href);
          const full = "long" in rest ? (rest.long as string) : label;
          return (
            <Link
              key={href}
              href={href}
              title={full}
              className={`flex w-full flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] font-bold transition lg:min-h-12 lg:flex-row lg:gap-3 lg:px-4 lg:py-0 lg:text-base ${
                i === NAV.length ? "mt-auto" : ""
              } ${active ? "bg-primary text-white shadow-sm" : "text-ink hover:bg-primary-soft"}`}
            >
              <Icon size={22} aria-hidden />
              <span className="lg:hidden">{label}</span>
              <span className="hidden lg:inline">{full}</span>
            </Link>
          );
        })}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between bg-background/90 px-4 pb-1.5 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
          <span className="font-display text-lg font-bold text-primary-dark">Familien</span>
          <span className="flex items-center gap-0.5">
            {EXTRA.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-label={label}
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  isActive(pathname, href) ? "bg-primary-soft text-primary-dark" : "text-ink-light"
                }`}
              >
                <Icon size={21} aria-hidden />
              </Link>
            ))}
            <span className="ml-1">{me}</span>
          </span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-3 pb-24 pt-1 md:px-5 md:pb-6 md:pt-4 lg:px-6">{children}</main>
      </div>

      <nav data-bottom-nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-card/95 backdrop-blur md:hidden">
        <ul className="grid grid-cols-5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${
                    active ? "text-primary-dark" : "text-ink-light"
                  }`}
                >
                  <span className={`rounded-full px-3.5 py-0.5 ${active ? "bg-primary-soft" : ""}`}>
                    <Icon size={22} aria-hidden />
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
