"use client";

import { useState, type KeyboardEvent } from "react";
import { ListMusic } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import { bounds, doorGap, doorSwing, FLOORS, FONT, labelLines, roomLook, VIEWBOX, type Door, type Floor, type Shape } from "@/lib/huset/floorplan";
import { FIXTURES, fixtureIndex, fixtureLook, labelDirection, type Fixture, type FixtureLook } from "@/lib/huset/fixtures";
import type { HomeState, Light, Room } from "@/lib/huset/home";
import type { Speaker, SpeakerGroup } from "@/lib/huset/sonos";
import type { HomeCommand } from "@/lib/validation/huset";
import { CoverLine } from "./CoversTab";
import { ApplianceLine } from "./AppliancesTab";
import { ValveLine } from "./WateringTab";
import { AirLine, ClimateLine } from "./HeatTab";
import { RoomLightsPanel } from "./LightsTab";
import { nowPlaying, PlayButton, VolumeSlider } from "./parts";

interface Props {
  home: HomeState;
  groups: SpeakerGroup[];
  run: (cmd: HomeCommand) => Promise<void>;
  onToggle: (leader: Speaker) => void;
  onVolume: (id: string, volume: number, send: boolean) => void;
  onMusic: (leader: Speaker) => void;
  /** Rommet som er åpent fra start (fra dashboardet). */
  initialRoom?: string | null;
  /** Høyden på kartet. */
  svgClassName?: string;
}

type View = "1" | "2" | "tak" | "ute";

const GLOW = "#ffc94d";

/** Ett felt på kartet: hvit (eller grønn ute) bunn og gul farge etter lysstyrken. Navnet tegnes for seg (`RoomLabel`). */
function RoomShape({ shape, room, label, selected, playing, onOpen, dim = false }: {
  dim?: boolean;
  shape: Shape;
  room: Room | undefined;
  label: string;
  selected: boolean;
  playing: Set<string>;
  onOpen: () => void;
}) {
  const look = roomLook(room, playing);
  const points = shape.pts.map((p) => p.join(",")).join(" ");
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <g role="button" tabIndex={0} aria-label={`${label}${look.alert ? ", røykvarsleren har gått" : ""}${look.glow ? ", lys på" : ""}${look.badges.length ? `, ${look.badges.join(" ")}` : ""}`} onClick={onOpen} onKeyDown={onKey} className="cursor-pointer outline-none [&:focus-visible>polygon:first-child]:stroke-[var(--color-primary)]">
      <polygon
        points={points}
        fill={room?.outdoor ? "#e3f4e8" : "#ffffff"}
        stroke={selected ? "var(--color-primary)" : room?.outdoor ? "#9cc9a9" : "none"}
        strokeWidth={selected ? 0.12 : 0.04}
        strokeDasharray={room?.outdoor && !selected ? "0.15 0.1" : undefined}
        strokeLinejoin="round"
      />
      {look.glow > 0 && <polygon points={points} fill={GLOW} fillOpacity={dim ? look.glow * 0.35 : look.glow} pointerEvents="none" />}
      {look.alert && <polygon points={points} fill="var(--color-danger)" fillOpacity={0.55} pointerEvents="none" className="animate-pulse" />}
    </g>
  );
}

/** Navn og merker midt i feltet (eller i `at`). Smale, høye felt får navnet på langs. */
function RoomLabel({ shape, room, label, multi, playing }: { shape: Shape; room: Room | undefined; label: string; multi: boolean; playing: Set<string> }) {
  const { x, y, w, h } = bounds(shape.pts);
  const look = roomLook(room, playing);
  const showName = !multi || shape.main;
  const vertical = w < 1 && h > 1.8;
  const lines = showName ? labelLines(label, vertical ? h : w) : shape.label ? labelLines(shape.label, w, FONT * 0.8) : [];
  const font = showName ? FONT : FONT * 0.8;
  const [cx, cy] = shape.at ?? [x + w / 2, y + h / 2];
  const total = lines.length * font * 1.15 + (showName && look.badges.length ? font : 0);
  const top = cy - total / 2 + font * 0.85;
  return (
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
  );
}

/** Døra: åpning i veggen, og dørblad med bue for slagdører. */
function DoorMark({ door }: { door: Door }) {
  const [x, y, w, h] = doorGap(door);
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} fill="#ffffff" />
      {doorSwing(door).map(({ leaf, arc }, i) => (
        <g key={i} fill="none" stroke="var(--color-ink-faint)" strokeWidth={0.035}>
          <line x1={leaf[0][0]} y1={leaf[0][1]} x2={leaf[1][0]} y2={leaf[1][1]} strokeWidth={0.05} />
          <path d={`M ${arc.from[0]} ${arc.from[1]} A ${arc.r} ${arc.r} 0 0 ${arc.sweep} ${arc.to[0]} ${arc.to[1]}`} strokeDasharray="0.08 0.06" />
        </g>
      ))}
    </g>
  );
}

/** Farger i koblingsvisningen, én per lys. */
const LIGHT_COLORS = ["#2563eb", "#d92d20", "#2e9d57", "#9333ea", "#d89b00", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5"];

/** Ett lyspunkt: grå prikk når det er av, gul glorie når det lyser (sterkere og større jo høyere lysstyrke). */
function FixtureMark({ fixture: f, look, showNumber, away }: { fixture: Fixture; look: FixtureLook; showNumber: boolean; away: [number, number] }) {
  const core = f.kind === "pendel" ? 0.24 : f.kind === "lampe" ? 0.18 : 0.09;
  const color = showNumber ? (f.light ? lightColor(f.light) : "#6b7280") : null;
  return (
    <g pointerEvents="none">
      {look.on && <circle cx={f.x} cy={f.y} r={core + 0.25 + 0.55 * look.level} fill="url(#fixture-glow)" opacity={0.35 + 0.65 * look.level} />}
      <circle
        cx={f.x}
        cy={f.y}
        r={core}
        fill={look.on ? "#f2b100" : "#ffffff"}
        fillOpacity={look.on ? 0.55 + 0.45 * look.level : 1}
        stroke={color ?? (look.on ? "#b07d00" : "var(--color-ink-faint)")}
        strokeWidth={color ? 0.06 : 0.035}
        strokeDasharray={!f.light && !color ? "0.05 0.04" : undefined}
      />
      {showNumber && (
        <text x={f.x + away[0] * (core + 0.2)} y={f.y + away[1] * (core + 0.2)} fontSize={0.26} fontWeight={700} textAnchor="middle" dominantBaseline="central" fill={color ?? "var(--color-ink)"} stroke="#fff" strokeWidth={0.06} paintOrder="stroke">
          {f.n}
        </text>
      )}
    </g>
  );
}

/** Koblingslisten under kartet: hvilke punkter hvert lys styrer, og hvilke som ikke er koblet. */
function FixtureLegend({ rooms }: { rooms: Room[] }) {
  const { byLight, unassigned } = fixtureIndex(FIXTURES);
  const names = new Map(rooms.flatMap((r) => r.lights.map((l) => [l.id, `${r.name}: ${l.name}`] as const)));
  return (
    <ul className="grid gap-x-4 gap-y-0.5 px-1 pt-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
      {[...byLight].map(([id, ns]) => (
        <li key={id} className="flex items-baseline gap-1.5">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: lightColor(id) }} />
          <span className="wrap-break-word">
            <b>{ns.join(", ")}</b> {names.get(id) ?? id}
          </span>
        </li>
      ))}
      {unassigned.length > 0 && (
        <li className="flex items-baseline gap-1.5">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-ink-light" />
          <span>
            <b>{unassigned.join(", ")}</b> ikke koblet
          </span>
        </li>
      )}
    </ul>
  );
}

// Fargene deles ut i rekkefølgen i koblingslisten, så lys i samme rom får ulike farger.
const COLOR_OF = new Map([...fixtureIndex(FIXTURES).byLight.keys()].map((id, i) => [id, LIGHT_COLORS[i % LIGHT_COLORS.length]]));
const lightColor = (id: string) => COLOR_OF.get(id) ?? "#6b7280";

export function FloorMap({ floor, rooms, selected, playing, onOpen, svgClassName = "max-h-[72dvh]", showNumbers = false }: {
  floor: Floor;
  rooms: Map<string, Room>;
  selected: string | null;
  playing: Set<string>;
  onOpen: (id: string) => void;
  svgClassName?: string;
  /** Koblingsvisning: lyspunktene med nummer og farge per lys. */
  showNumbers?: boolean;
}) {
  const lights = new Map([...rooms.values()].flatMap((r) => r.lights.map((l): [string, Light] => [l.id, l])));
  const fixtures = FIXTURES.filter((f) => f.floor === floor.id);
  // Rom med lyspunkter viser lyset i punktene; selve rommet får bare en svak gultone.
  const withFixtures = new Set([...rooms.values()].filter((r) => r.lights.some((l) => fixtures.some((f) => f.light === l.id))).map((r) => r.id));
  const count = (id: string) => floor.shapes.filter((s) => s.room === id).length;
  const labelOf = (s: Shape) => (s.label && count(s.room) === 1 ? s.label : (rooms.get(s.room)?.name ?? s.room));
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-xs font-bold uppercase tracking-wide text-ink-light">{floor.name}</figcaption>
      <svg viewBox={`${(floor.viewBox ?? VIEWBOX).x} ${(floor.viewBox ?? VIEWBOX).y} ${(floor.viewBox ?? VIEWBOX).w} ${(floor.viewBox ?? VIEWBOX).h}`} className={`h-auto w-full ${svgClassName}`} role="group" aria-label={floor.name}>
        <defs>
          <radialGradient id="fixture-glow">
            <stop offset="0%" stopColor="#ffd34d" stopOpacity={0.95} />
            <stop offset="100%" stopColor="#ffd34d" stopOpacity={0} />
          </radialGradient>
        </defs>
        {/* Huset er vegg der det ikke er rom. */}
        {floor.footprint.map(([x0, y0, x1, y1], i) => (
          <rect key={i} x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="var(--color-ink-faint)" />
        ))}
        {floor.shapes.map((s, i) => (
          <RoomShape key={`${s.room}-${i}`} shape={s} room={rooms.get(s.room)} label={labelOf(s)} selected={selected === s.room} playing={playing} onOpen={() => onOpen(s.room)} dim={withFixtures.has(s.room)} />
        ))}
        {fixtures.map((f) => (
          <FixtureMark key={f.n} fixture={f} look={fixtureLook(f, lights)} showNumber={showNumbers} away={labelDirection(f, fixtures)} />
        ))}
        {floor.obstacles?.map(([x0, y0, x1, y1, name], i) => (
          <g key={i} pointerEvents="none">
            <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="var(--color-ink-faint)" />
            {name && (
              <text x={(x0 + x1) / 2} y={(y0 + y1) / 2 + FONT * 0.3} fontSize={FONT * 0.8} textAnchor="middle" fill="#ffffff" fontWeight={600}>
                {name}
              </text>
            )}
          </g>
        ))}
        {floor.doors.map((d, i) => (
          <DoorMark key={i} door={d} />
        ))}
        {floor.shapes.map((s, i) => (
          <RoomLabel key={`${s.room}-${i}`} shape={s} room={rooms.get(s.room)} label={labelOf(s)} multi={count(s.room) > 1} playing={playing} />
        ))}
      </svg>
    </figure>
  );
}

/** Alt som kan styres i ett rom: lys og scener, varme, persienner og musikk. */
function RoomSheet({ room, groups, onClose, ...p }: Omit<Props, "home" | "initialRoom" | "svgClassName"> & { room: Room; onClose: () => void }) {
  const speakers = groups.flatMap((g) => g.speakers.map((s) => ({ speaker: s, leader: g.leader }))).filter((x) => room.speakers.includes(x.speaker.id));
  const empty = !room.lights.length && !room.climate && !room.air && !room.appliances?.length && !room.valves?.length && !room.hatch && !room.covers.length && !speakers.length;
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
      {room.air && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-light">Luft</h3>
          <AirLine air={room.air} />
        </section>
      )}
      {room.appliances && room.appliances.length > 0 && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-light">Maskiner</h3>
          {room.appliances.map((a) => (
            <ApplianceLine key={a.id} appliance={a} />
          ))}
        </section>
      )}
      {room.hatch && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-light">Takluke</h3>
          <p className="flex flex-wrap items-baseline gap-x-2 py-1 text-sm">
            <span className={`font-semibold ${room.hatch.state === "closed" || room.hatch.state === "unknown" ? "" : "text-primary-dark"}`}>{room.hatch.text}</span>
            {room.hatch.since && (
              <span className="text-xs text-ink-light">
                siden {new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(room.hatch.since))}
              </span>
            )}
          </p>
          <p className="text-xs text-ink-light">
            {room.hatch.fromContact ? "Fra sensoren på luka." : "Anslått ut fra om den sist ble åpnet eller lukket."} Luka åpnes og lukkes ikke fra appen.
          </p>
        </section>
      )}
      {room.valves && room.valves.length > 0 && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-light">Vanning</h3>
          {room.valves.map((v) => (
            <ValveLine key={v.id} valve={v} run={p.run} />
          ))}
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
export function MapTab({ home, groups, run, onToggle, onVolume, onMusic, initialRoom = null, svgClassName }: Props) {
  const startFloor = home.rooms.find((r) => r.id === initialRoom)?.floor;
  const [view, setView] = useState<View>(initialRoom && FLOORS[2].shapes.some((x) => x.room === initialRoom) ? "tak" : startFloor === 1 ? "1" : "2");
  const [selected, setSelected] = useState<string | null>(initialRoom);
  const [numbers, setNumbers] = useState(false);
  const rooms = new Map(home.rooms.map((r) => [r.id, r]));
  const playing = new Set(groups.filter((g) => g.leader.status === "playing").flatMap((g) => g.speakers.map((s) => s.id)));
  const onMap = new Set(FLOORS.flatMap((f) => f.shapes.map((s) => s.room)));
  const outside = home.rooms.filter((r) => r.outdoor && !onMap.has(r.id));
  const room = selected ? rooms.get(selected) : undefined;
  const views: { id: View; label: string }[] = [
    { id: "1", label: "1. etasje" },
    { id: "2", label: "2. etasje" },
    { id: "tak", label: "Taket" },
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
        {/* Telefon og nettbrett: én etasje om gangen. PC: alle side om side, i samme målestokk. */}
        <div className="lg:hidden">
          {view === "ute" ? (
            <div className="flex flex-col gap-3 p-1">
              <FloorMap floor={FLOORS[1]} rooms={rooms} selected={selected} playing={playing} onOpen={setSelected} svgClassName={svgClassName} showNumbers={numbers} />
              {outdoorList}
            </div>
          ) : (
            <FloorMap floor={FLOORS.find((f) => f.id === view)!} rooms={rooms} selected={selected} playing={playing} onOpen={setSelected} svgClassName={svgClassName} showNumbers={numbers} />
          )}
        </div>
        <div className="hidden gap-4 lg:grid" style={{ gridTemplateColumns: FLOORS.map((f) => `${(f.viewBox ?? VIEWBOX).w}fr`).join(" ") }}>
          {FLOORS.map((f) => (
            <FloorMap key={f.id} floor={f} rooms={rooms} selected={selected} playing={playing} onOpen={setSelected} svgClassName={svgClassName} showNumbers={numbers} />
          ))}
        </div>
        <p className="px-1 pt-1 text-xs text-ink-light">Gult = lys på · 🎵 musikk · 🔥 varmer · 💧 vanner · 🧺 🍽️ ♨️ maskin går · ▾ persienne nede · CO₂ dårlig luft · 🚨 røykvarsler har gått. Trykk på et rom for å styre det.</p>
        <button type="button" onClick={() => setNumbers((v) => !v)} aria-pressed={numbers} className="px-1 pt-1 text-xs font-semibold text-primary-dark underline">
          {numbers ? "Skjul nummer på lyspunktene" : "Vis lyspunktene med nummer"}
        </button>
        {numbers && <FixtureLegend rooms={home.rooms} />}
      </div>

      <div className={view === "ute" ? "hidden lg:block" : ""}>{outdoorList}</div>

      {room && (
        <RoomSheet room={room} groups={groups} run={run} onToggle={onToggle} onVolume={onVolume} onMusic={(leader) => (setSelected(null), onMusic(leader))} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
