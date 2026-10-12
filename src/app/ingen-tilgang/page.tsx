import { LogoutButton } from "@/components/LogoutButton";
import { card } from "@/components/ui/styles";

export const metadata = { title: "Ingen tilgang – Familien" };

export default function NoAccessPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className={`${card} flex max-w-md flex-col items-center gap-4 p-8 text-center`}>
        <span className="text-6xl" aria-hidden>
          🔒
        </span>
        <h1 className="font-display text-3xl font-bold">Ingen tilgang</h1>
        <p className="text-ink-light">
          Du er logget inn, men brukeren din er ikke koblet til familien ennå. Be Ingvild eller Marius legge deg til.
        </p>
        <LogoutButton />
      </div>
    </main>
  );
}
