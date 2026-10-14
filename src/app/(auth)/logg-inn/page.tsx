import { redirect } from "next/navigation";
import { AUTH_ENABLED } from "@/lib/env";
import { safeNextPath } from "@/lib/safeRedirect";
import { card } from "@/components/ui/styles";
import { appIconElement } from "@/lib/appIcon";
import { LoginForms } from "./LoginForms";

export const metadata = { title: "Logg inn – Familien" };

export default async function LoginPage({ searchParams }: PageProps<"/logg-inn">) {
  if (!AUTH_ENABLED) redirect("/");
  const params = await searchParams;
  const next = safeNextPath(typeof params.neste === "string" ? params.neste : "/");
  const failed = params.feil === "lenke";

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className={`${card} flex w-full max-w-md flex-col items-center gap-2 p-8`}>
        <div className="h-20 w-20 overflow-hidden rounded-3xl">{appIconElement(80)}</div>
        <h1 className="font-display text-xl font-bold sm:text-2xl lg:text-3xl text-primary-dark">Familien</h1>
        <p className="mb-4 text-center text-ink-light">Kalender, oppgaver og handleliste for hele familien</p>
        {failed && (
          <p className="mb-2 w-full rounded-2xl bg-primary-soft p-3 text-center font-semibold">
            Lenken virket ikke eller har utløpt. Prøv igjen.
          </p>
        )}
        <LoginForms next={next} />
      </div>
    </main>
  );
}
