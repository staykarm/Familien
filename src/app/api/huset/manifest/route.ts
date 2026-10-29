import type { MetadataRoute } from "next";

/**
 * Egen hjemskjerm-app for Huset: «Legg til på Hjem-skjerm» fra /huset gir et eget ikon som åpner rett i Huset.
 * Ligger under /api/ fordi manifestet må kunne hentes før enheten er låst opp (se OPEN_PREFIXES).
 */
export function GET() {
  const manifest: MetadataRoute.Manifest = {
    id: "/huset",
    name: "Huset",
    short_name: "Huset",
    description: "Musikk og styring av huset",
    lang: "nb",
    start_url: "/huset",
    scope: "/huset",
    display: "standalone",
    background_color: "#fff8ef",
    theme_color: "#fff8ef",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return Response.json(manifest, { headers: { "Content-Type": "application/manifest+json" } });
}
