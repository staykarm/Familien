import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Familien",
    short_name: "Familien",
    description: "Familiens kalender, oppgaver og handleliste",
    lang: "nb",
    start_url: "/",
    display: "standalone",
    background_color: "#fff8ef",
    theme_color: "#fff8ef",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
