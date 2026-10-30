import { loadHouse, loadHouseSetup } from "@/actions/huset";
import { HousePage } from "@/components/huset/HousePage";
import { requireFamily } from "@/lib/session";

/** «Huset» via Home Assistant. `?fane=<fane>` åpner en fane, og `?spotify=<status>` kommer fra Spotify-innloggingen. */
export default async function HusetPage({ searchParams }: PageProps<"/huset">) {
  await requireFamily();
  const [initial, setup, params] = await Promise.all([loadHouse(), loadHouseSetup(), searchParams]);
  const notice = typeof params.spotify === "string" ? params.spotify : null;
  const tab = typeof params.fane === "string" ? params.fane : null;
  return <HousePage initial={initial} setup={setup} notice={notice} initialTab={tab} />;
}
