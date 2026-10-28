import { loadHouse } from "@/actions/huset";
import { HousePage } from "@/components/huset/HousePage";
import { requireFamily } from "@/lib/session";

/** «Huset»: musikk (Sonos) via Home Assistant. Lys, varme og persienner kommer i senere faser. */
export default async function HusetPage() {
  await requireFamily();
  return <HousePage initial={await loadHouse()} />;
}
