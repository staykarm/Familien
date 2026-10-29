import type { Metadata } from "next";

// Huset kan legges på hjemskjermen som en egen app (eget manifest og navn).
export const metadata: Metadata = {
  title: "Huset",
  manifest: "/api/huset/manifest",
  appleWebApp: { title: "Huset", statusBarStyle: "default", capable: true },
};

export default function HusetLayout({ children }: LayoutProps<"/huset">) {
  return children;
}
