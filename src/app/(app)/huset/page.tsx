import { loadHouse, loadHouseSetup } from "@/actions/huset";
import { HousePage } from "@/components/huset/HousePage";
import { requireFamily } from "@/lib/session";

/** «Huset»: musikk (Sonos og Spotify) via Home Assistant. `?spotify=<status>` kommer fra Spotify-innloggingen. */
export default async function HusetPage({ searchParams }: PageProps<"/huset">) {
  await requireFamily();
  const [initial, setup, params] = await Promise.all([loadHouse(), loadHouseSetup(), searchParams]);
  const notice = typeof params.spotify === "string" ? params.spotify : null;
  return <HousePage initial={initial} setup={setup} notice={notice} />;
}
