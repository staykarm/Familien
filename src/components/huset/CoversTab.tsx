"use client";

import { ChevronDown, ChevronUp, Square } from "lucide-react";
import type { Cover, HomeState } from "@/lib/huset/home";
import type { HomeCommand } from "@/lib/validation/huset";
import { IconButton, Range } from "./parts";
import { usePending } from "./usePending";

interface Props {
  home: HomeState;
  run: (cmd: HomeCommand) => Promise<void>;
}

/** «Oppe», «Nede» eller «40 %». Home Assistant bruker 100 = oppe. */
function positionText(c: Cover): string {
  if (c.moving === "opening") return "Går opp …";
  if (c.moving === "closing") return "Går ned …";
  if (c.position === null) return "Felles";
  if (c.position >= 99) return "Oppe";
  if (c.position <= 1) return "Nede";
  return `${c.position} % oppe`;
}

/** Én linje per persienne: navn og status, posisjon (fra `sm`), og opp/stopp/ned. */
function CoverRow({ cover, room, pending, run }: { cover: Cover; room?: string; pending: ReturnType<typeof usePending<Cover>>; run: Props["run"] }) {
  const c = pending.show(cover.id, cover);
  const off = !c.available;
  const command = (cmd: "open" | "close" | "stop") =>
    void pending.send(c.id, { moving: cmd === "open" ? "opening" : cmd === "close" ? "closing" : null }, () => run({ action: "cover", id: c.id, command: cmd }));
  const position = (v: number, send: boolean) => {
    if (!send) return pending.preview(c.id, { position: v });
    void pending.send(c.id, { position: v }, () => run({ action: "cover_position", id: c.id, position: v }));
  };
  // Persienner med samme navn som rommet vises bare med romnavnet.
  const name = room && room !== c.name ? `${room} – ${c.name}` : c.name;
  return (
    <li className={`flex items-center gap-2 border-b border-line py-1 ${off ? "opacity-50" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold wrap-break-word">{name}</p>
        <p className="text-xs text-ink-light">{off ? "Svarer ikke" : positionText(c)}</p>
      </div>
      {c.position !== null && (
        <Range value={c.position} label={`Posisjon ${name}`} disabled={off} onChange={position} className="hidden h-7 max-w-32 sm:block" />
      )}
      <IconButton onClick={() => command("open")} label={`${name} opp`} disabled={off}>
        <ChevronUp size={18} aria-hidden />
      </IconButton>
      <IconButton onClick={() => command("stop")} label={`Stopp ${name}`} disabled={off}>
        <Square size={12} aria-hidden />
      </IconButton>
      <IconButton onClick={() => command("close")} label={`${name} ned`} disabled={off}>
        <ChevronDown size={18} aria-hidden />
      </IconButton>
    </li>
  );
}

/** Én persienne (brukes i arket fra kartet). */
export function CoverLine({ cover, run }: { cover: Cover; run: Props["run"] }) {
  const pending = usePending<Cover>();
  return (
    <ul>
      <CoverRow cover={cover} pending={pending} run={run} />
    </ul>
  );
}

/** Persienner i én liste: felles styring først, så rom for rom. */
export function CoversTab({ home, run }: Props) {
  const pending = usePending<Cover>();
  const rows = [
    ...home.sharedCovers.map((c) => ({ cover: c, room: undefined as string | undefined })),
    ...home.rooms.flatMap((r) => r.covers.map((c) => ({ cover: c, room: r.covers.length > 1 || r.name !== c.name ? r.name : undefined }))),
  ];
  return (
    <ul className="grid gap-x-4 rounded-2xl bg-card px-3 py-1 shadow-[0_2px_12px_rgba(120,90,60,0.08)] md:grid-cols-2 xl:grid-cols-3">
      {rows.map(({ cover, room }) => (
        <CoverRow key={cover.id} cover={cover} room={room} pending={pending} run={run} />
      ))}
    </ul>
  );
}
