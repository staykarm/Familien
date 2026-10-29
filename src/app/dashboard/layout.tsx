import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Dashboard – Familien" };

export const viewport: Viewport = { themeColor: "#f6f6f7" };

/** Dashboardet har sin egen ramme (ingen meny fra resten av appen) og sin egen, nøytrale stil (`.dash` i globals.css). */
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return <div className="dash min-h-dvh">{children}</div>;
}
