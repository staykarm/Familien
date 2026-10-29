"use client";

import { useState, type KeyboardEvent } from "react";
import { ListMusic } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import { FLOORS, FONT, labelLines, roomLook, VIEWBOX, type Floor, type Shape } from "@/lib/huset/floorplan";
import type { HomeState, Room } from "@/lib/huset/home";
import type { Speaker, SpeakerGroup } from "@/lib/huset/sonos";
import type { HomeCommand } from "@/lib/validation/huset";
import { CoverLine } from "./CoversTab";
import { ClimateLine } from "./HeatTab";
import { RoomLightsPanel } from "./LightsTab";
import { nowPlaying, PlayButton, VolumeSlider } from "./parts";

interface Props {
  home: HomeState;
  groups: SpeakerGroup[];
  run: (cmd: HomeCommand) => Promise<void>;
  onToggle: (leader: Speaker) => void;
  onVolume: (id: string, volume: number, send: boolean) => void;
  onMusic: (leader: Speaker) => void;
}

type View = "1" | "2" | "ute";

const GLOW = "#ffc94d";

/** Ett felt på kartet: hvit (eller grønn ute) bunn, gul farge etter lysstyrken, navn og merker. */
function RoomShape({ shape, room, label, multi, selected, playing, onOpen }: {
  shape: Shape;
  room: Room | undefined;
  label: string;
  multi: boolean;
  selected: boolean;
  playing: Set<string>;
  onOpen: () => void;
}) {
  const { x, y, w, h } = shape;
  const look = roomLook(room, playing);
  const showName = !multi || shape.main;
  const vertical = w < 1.2 && h > 2;
  const lines = showName ? labelLines(label, vertical ? h : w) : shape.label ? labelLines(shape.label, w, FONT * 0.8) : [];
  const font = showName ? FONT : FONT * 0.8;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const total = lines.length * font * 1.15 + (showName && look.badges.length ? font : 0);
  const top = cy - total / 2 + font * 0.85;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <g role="button" tabIndex={0} aria-label={`${label}${look.glow ? ", lys på" : ""}${look.badges.length ? `, ${look.badges.join(" ")}` : ""}`} onClick={onOpen} onKeyDown={onKey} className="cursor-pointer outline-none [&:focus-visible>rect:first-child]:stroke-[var(--color-primary)]">
      <rect x={x} y={y} width={w} height={h} rx={0.2} fill={room?.outdoor ? "#e3f4e8" : "#ffffff"} stroke={selected ? "var(--color-primary)" : "#cfc6d8"} strokeWidth={selected ? 0.12 : 0.05} />
      {look.glow > 0 && <rect x={x + 0.04} y={y + 0.04} width={w - 0.08} height={h - 0.08} rx={0.18} fill={GLOW} fillOpacity={look.glow} pointerEvents="none" />}
      <g transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined} pointerEvents="none">
        {lines.map((line, i) => (
          <text key={i} x={cx} y={top + i * font * 1.15} fontSize={font} textAnchor="middle" fill="var(--color-ink)" fontWeight={showName ? 700 : 500}>
            {line}
          </text>
        ))}
        {showName && look.badges.length > 0 && (
          <text x={cx} y={top + lines.length * font * 1.15} fontSize={font * 0.85} textAnchor="middle" fill="var(--color-ink-light)">
            {look.badges.join(" ")}
          </text>
        )}
      </g>
    </g>
  );
}

function FloorMap({ floor, rooms, selected, playing, onOpen }: { floor: Floor; rooms: Map<string, Room>; selected: string | null; playing: Set<string>; onOpen: (id: string) => void }) {
  const count = (id: string) => floor.shapes.filter((s) => s.room === id).length;
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-xs font-bold uppercase tracking-wide text-ink-light">{floor.name}</figcaption>
      <svg viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`} className="h-auto max-h-[72dvh] w-full" role="group" aria-label={floor.name}>
        {floor.shapes.map((s, i) => {
          const room = rooms.get(s.room);
          return (
            <RoomShape
              key={`${s.room}-${i}`}
              shape={s}
              room={room}
              label={s.label && count(s.room) === 1 ? s.label : (room?.name ?? s.room)}
              multi={count(s.room) > 1}
              selected={selected === s.room}
              playing={playing}
              onOpen={() => onOpen(s.room)}
            />
          );
        })}
      </svg>
    </figure>
  );
}

/** Alt som kan styres i ett rom: lys og scener, varme, persienner og musikk. */
function RoomSheet({ room, groups, onClose, ...p }: Omit<Props, "home"> & { room: Room; onClose: () => void }) {
  const speakers = groups.flatMap((g) => g.speakers.map((s) => ({ speaker: s, leader: g.leader }))).filter((x) => room.speakers.includes(x.speaker.id));
  const empty = !room.lights.length && !room.climate && !room.covers.length && !speakers.length;
  return (
    <Sheet
      title={room.name}
      onClose={onClose}
      onSubmit={onClose}
      footer={
        <button type="submit" className={buttonPrimary}>
          Ferdig
        </button>
      }
    >
      {empty && <p className="text-ink-light">Ingenting å styre her ennå.</p>}
      {room.lights.length > 0 && <RoomLightsPanel room={room} run={p.run} />}
      {room.climate && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-light">Varme</h3>
          <ClimateLine climate={room.climate} run={p.run} />
        </section>
      )}
      {room.covers.length > 0 && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-light">Persienner</h3>
          {room.covers.map((c) => (
            <CoverLine key={c.id} cover={c} run={p.run} />
          ))}
        </section>
      )}
      {speakers.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-light">Musikk</h3>
          {speakers.map(({ speaker, leader }) => (
            <div key={speaker.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold wrap-break-word">{speaker.name}</p>
                  <p className="text-xs text-ink-light wrap-break-word">
                    {speaker.status === "unavailable" ? "Svarer ikke" : nowPlaying(leader)}
                    {leader.id !== speaker.id && ` (sammen med ${leader.name})`}
                  </p>
                </div>
                {speaker.status !== "unavailable" && (
                  <>
                    <button type="button" className={`${buttonSecondary} min-h-10 px-3 text-sm`} onClick={() => p.onMusic(leader)}>
                      <ListMusic size={16} aria-hidden />
                      <span className="hidden sm:inline">Velg musikk</span>
                    </button>
                    <PlayButton playing={leader.status === "playing"} onClick={() => p.onToggle(leader)} label={speaker.name} />
                  </>
                )}
              </div>
              {speaker.status !== "unavailable" && <VolumeSlider speaker={speaker} onVolume={p.onVolume} />}
            </div>
          ))}
        </section>
      )}
    </Sheet>
  );
}

/**
 * Kart over etasjene: trykk på et rom for å styre alt der. Rommet blir gult når lyset er på (sterkere jo høyere
 * lysstyrke), med merker for temperatur, varme, musikk og persienne nede. På PC står begge etasjene side om side.
 */
export function MapTab({ home, groups, run, onToggle, onVolume, onMusic }: Props) {
  const [view, setView] = useState<View>("2");
  const [selected, setSelected] = useState<string | null>(null);
  const rooms = new Map(home.rooms.map((r) => [r.id, r]));
  const playing = new Set(groups.filter((g) => g.leader.status === "playing").flatMap((g) => g.speakers.map((s) => s.id)));
  const onMap = new Set(FLOORS.flatMap((f) => f.shapes.map((s) => s.room)));
  const outside = home.rooms.filter((r) => r.outdoor && !onMap.has(r.id));
  const room = selected ? rooms.get(selected) : undefined;
  const views: { id: View; label: string }[] = [
    { id: "1", label: "1. etasje" },
    { id: "2", label: "2. etasje" },
    { id: "ute", label: "Ute" },
  ];

  const outdoorList = (
    <section aria-label="Ute" className="flex flex-wrap gap-2">
      {outside.map((r) => {
        const on = r.lights.filter((l) => l.available && l.on).length;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => setSelected(r.id)}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border-2 px-3 text-sm font-semibold transition ${on ? "border-[#f5b041] bg-[#fff3d6]" : "border-line bg-card"}`}
          >
            {r.name}
            <span className="text-xs font-normal text-ink-light">{on ? `${on} lys på` : "alt av"}</span>
          </button>
        );
      })}
    </section>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 lg:hidden" role="tablist" aria-label="Velg etasje">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setView(v.id)}
            className={`min-h-10 rounded-full border-2 px-4 text-sm font-bold transition ${view === v.id ? "border-primary bg-primary-soft text-primary-dark" : "border-line bg-card"}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-card p-2 shadow-[0_2px_12px_rgba(120,90,60,0.08)]">
        {/* Telefon og nettbrett: én etasje om gangen. PC: begge side om side. */}
        <div className="lg:hidden">
          {view === "ute" ? (
            <div className="flex flex-col gap-3 p-1">
              <FloorMap floor={FLOORS[1]} rooms={rooms} selected={selected} playing={playing} onOpen={setSelected} />
              {outdoorList}
            </div>
          ) : (
            <FloorMap floor={FLOORS.find((f) => f.id === view)!} rooms={rooms} selected={selected} playing={playing} onOpen={setSelected} />
          )}
        </div>
        <div className="hidden grid-cols-2 gap-4 lg:grid">
          {FLOORS.map((f) => (
            <FloorMap key={f.id} floor={f} rooms={rooms} selected={selected} playing={playing} onOpen={setSelected} />
          ))}
        </div>
        <p className="px-1 pt-1 text-xs text-ink-light">Gult = lys på · 🎵 musikk · 🔥 varmer · ▾ persienne nede. Trykk på et rom for å styre det.</p>
      </div>

      <div className={view === "ute" ? "hidden lg:block" : ""}>{outdoorList}</div>

      {room && (
        <RoomSheet room={room} groups={groups} run={run} onToggle={onToggle} onVolume={onVolume} onMusic={(leader) => (setSelected(null), onMusic(leader))} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
