// Appene til produsentene, for å gå videre fra Huset (oppsett, kart, programmer og alt Home Assistant ikke viser).
// Lenken går til appen i App Store: på iPhone og iPad står «Åpne» der når appen er installert, og «Hent» ellers.

export interface VendorApp {
  name: string;
  /** Id-en i App Store (apps.apple.com/app/id<id>). */
  appStoreId: string;
}

export const VENDOR_APPS = {
  roborock: { name: "Roborock", appStoreId: "1462875428" },
  navimow: { name: "Navimow", appStoreId: "1602205067" },
  gardena: { name: "Gardena", appStoreId: "971199503" },
  miele: { name: "Miele", appStoreId: "930406907" },
} satisfies Record<string, VendorApp>;

export type VendorAppId = keyof typeof VENDOR_APPS;

/** Lenken til appen i App Store (norsk butikk). */
export const appLink = (id: VendorAppId) => `https://apps.apple.com/no/app/id${VENDOR_APPS[id].appStoreId}`;
