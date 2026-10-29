"use client";

import { ChevronDown, ChevronUp, Square } from "lucide-react";
import { card } from "@/components/ui/styles";
import type { Cover, HomeState } from "@/lib/huset/home";
import type { HomeCommand } from "@/lib/validation/huset";
import { Range } from "./parts";
import { usePending } from "./usePending";

interface Props {
  home: HomeState;
  run: (cmd: HomeCommand) => Promise<void>;
}

/** «Oppe», «Nede» eller «40 % oppe». Home Assistant bruker 100 = oppe. */
function positionText(c: Cover): string {
  if (c.moving === "opening") return "Går opp …";
  if (c.moving === "closing") return "Går ned …";
  if (c.position === null) return "Felles styring";
  if (c.position >= 99) return "Oppe";
  if (c.position <= 1) return "Nede";
  return `${c.position} % oppe`;
}

function Btn({ onClick, label, children, disabled }: { onClick: () => void; label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-line bg-card transition active:scale-95 hover:border-primary disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function CoverRow({ cover, pending, run }: { cover: Cover; pending: ReturnType<typeof usePending<Cover>>; run: Props["run"] }) {
  const c = pending.show(cover.id, cover);
  const off = !c.available;
  const command = (cmd: "open" | "close" | "stop") =>
    void pending.send(c.id, { moving: cmd === "open" ? "opening" : cmd === "close" ? "closing" : null }, () => run({ action: "cover", id: c.id, command: cmd }));
  const position = (v: number, send: boolean) => {
    if (!send) return pending.preview(c.id, { position: v });
    void pending.send(c.id, { position: v }, () => run({ action: "cover_position", id: c.id, position: v }));
  };
  return (
    <li className={`flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4 ${off ? "opacity-50" : ""}`}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-bold wrap-break-word">{c.name}</p>
          <p className="text-sm text-ink-light">{off ? "Svarer ikke" : positionText(c)}</p>
        </div>
        <Btn onClick={() => command("open")} label={`${c.name} opp`} disabled={off}>
          <ChevronUp size={22} aria-hidden />
        </Btn>
        <Btn onClick={() => command("stop")} label={`Stopp ${c.name}`} disabled={off}>
          <Square size={16} aria-hidden />
        </Btn>
        <Btn onClick={() => command("close")} label={`${c.name} ned`} disabled={off}>
          <ChevronDown size={22} aria-hidden />
        </Btn>
      </div>
      {c.position !== null && (
        <div className="flex items-center gap-2 text-sm text-ink-light sm:w-56">
          <span>Nede</span>
          <Range value={c.position} label={`Posisjon ${c.name}`} disabled={off} onChange={position} />
          <span>Oppe</span>
        </div>
      )}
    </li>
  );
}

/** Persienner: felles styring øverst, så rom for rom med opp/stopp/ned og posisjon. */
export function CoversTab({ home, run }: Props) {
  const pending = usePending<Cover>();
  const rooms = home.rooms.filter((r) => r.covers.length);
  return (
    <div className="flex flex-col gap-3">
      {home.sharedCovers.length > 0 && (
        <section className={card} aria-label="Felles">
          <h3 className="font-display text-lg font-bold">Felles</h3>
          <ul className="flex flex-col divide-y-2 divide-line">
            {home.sharedCovers.map((c) => (
              <CoverRow key={c.id} cover={c} pending={pending} run={run} />
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {rooms.map((r) => (
          <section key={r.id} className={card} aria-label={r.name}>
            <h3 className="font-display text-lg font-bold">{r.name}</h3>
            <ul className="flex flex-col divide-y-2 divide-line">
              {r.covers.map((c) => (
                <CoverRow key={c.id} cover={c} pending={pending} run={run} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
