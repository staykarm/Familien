import { card } from "@/components/ui/styles";

export const metadata = { title: "Handleliste – Familien" };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-4xl font-bold">Handleliste</h1>
      <section className={`${card} flex flex-col items-center gap-2 py-12 text-center`}>
        <span className="text-5xl" aria-hidden>
          🛒
        </span>
        <p className="text-ink-light">Kommer i en senere fase.</p>
      </section>
    </div>
  );
}
