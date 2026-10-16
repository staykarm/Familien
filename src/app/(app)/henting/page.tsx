import { loadCare } from "@/actions/care";
import { CarePage } from "@/components/care/CarePage";
import { loadFamilyUi } from "@/lib/familyUi";
import { requireFamily } from "@/lib/session";

export const metadata = { title: "Levering og henting – Familien" };

/** Egen side for levering og henting (i hovedmenyen). `?barn=<id>` velger barnet. */
export default async function CarePagePage({ searchParams }: PageProps<"/henting">) {
  const session = await requireFamily();
  const [{ members }, care, params] = await Promise.all([loadFamilyUi(session), loadCare(), searchParams]);
  const barn = typeof params.barn === "string" ? params.barn : null;
  return <CarePage members={members} care={care} initialChild={barn} />;
}
