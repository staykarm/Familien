import { getShopping } from "@/actions/shopping";
import { ShoppingList } from "@/components/shopping/ShoppingList";
import { loadFamilyUi } from "@/lib/familyUi";
import { requireFamily } from "@/lib/session";

export const metadata = { title: "Handleliste – Familien" };

export default async function ShoppingPage() {
  const session = await requireFamily();
  const [{ categories }, data] = await Promise.all([loadFamilyUi(session), getShopping()]);
  return <ShoppingList initial={data} categories={categories.shopping} />;
}
