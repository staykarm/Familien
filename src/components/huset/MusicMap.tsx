"use client";

import { useState } from "react";
import { ListMusic, Unlink, X } from "lucide-react";
import { bounds, FLOORS, FONT, labelLines, VIEWBOX, type Floor } from "@/lib/huset/floorplan";
import type { HomeState, Room } from "@/lib/huset/home";
import { coloredGroups, GROUP_COLORS, nowPlayingText, planGroup, roomMusic, type RoomMusic } from "@/lib/huset/musicMap";
import { groupName, type Speaker, type SpeakerGroup } from "@/lib/huset/sonos";
import { Cover, nowPlaying, PlayButton, VolumeSlider } from "./parts";
import { Details } from "./RoomList";

interface Props {
  home: HomeState;
  groups: SpeakerGroup[];
  /** Spill de valgte høyttalerne sammen. */
  onGroup: (speakers: string[]) => void;
  /** Ta høyttalerne ut av gruppene sine. */
  onSolo: (speakers: string[]) => void;
  onToggle: (leader: Speaker) => void;
  onMusic: (leader: Speaker) => void;
  onSkip: (leader: Speaker, action: "next" | "previous") => void;
  onVolume: (id: string, volume: number, send: boolean) => void;
  /** Spill en Sonos-favoritt i de valgte rommene (de kobles sammen først hvis de er flere). */
  onSource: (speakers: string[], source: string) => void;
  /** Velg musikk (Spotify) for de valgte rommene (de kobles sammen først hvis de er flere). */
  onPick: (speakers: string[]) => void;
}

type View = "1" | "2" | "tak";

/** Én etasje: rom med høyttaler i gruppens farge, med det som spilles, og ramme rundt de valgte. */
function MusicFloor({ floor, rooms, music, selected, onPick }: {
  floor: Floor;
  rooms: Map<string, Room>;
  music: Map<string, RoomMusic>;
  selected: Set<string>;
  onPick: (room: Room) => void;
}) {
  const vb = floor.viewBox ?? VIEWBOX;
  const count = (id: string) => floor.shapes.filter((s) => s.room === id).length;
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-xs font-bold uppercase tracking-wide text-ink-light">{floor.name}</figcaption>
      <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="h-auto max-h-[70dvh] w-full" role="group" aria-label={floor.name}>
        {floor.footprint.map(([x0, y0, x1, y1], i) => (
          <rect key={i} x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="var(--color-ink-faint)" />
        ))}
        {floor.shapes.map((s, i) => {
          const room = rooms.get(s.room);
          const m = music.get(s.room);
          const points = s.pts.map((p) => p.join(",")).join(" ");
          const isSelected = !!room && room.speakers.some((id) => selected.has(id));
          if (!room || !m) return <polygon key={i} points={points} fill={room?.outdoor ? "#eef3ea" : "#f6f3ee"} />;
          return (
            <g
              key={i}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`${room.name}${m.playing ? ", spiller" : ""}${isSelected ? ", valgt" : ""}`}
              onClick={() => onPick(room)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(room))}
              className="cursor-pointer outline-none"
            >
              <polygon points={points} fill="#ffffff" />
              {m.color && <polygon points={points} fill={m.color} fillOpacity={m.playing ? 0.32 : 0.14} />}
              <polygon
                points={points}
                fill="none"
                stroke={isSelected ? "var(--color-primary)" : (m.color ?? "#cbc3d6")}
                strokeWidth={isSelected ? 0.16 : m.color ? 0.08 : 0.04}
                strokeDasharray={isSelected || m.color ? undefined : "0.15 0.1"}
                strokeLinejoin="round"
              />
            </g>
          );
        })}
        {floor.shapes.map((s, i) => {
          const room = rooms.get(s.room);
          if (!room || (count(s.room) > 1 && !s.main)) return null;
          const m = music.get(s.room);
          const { x, y, w, h } = bounds(s.pts);
          const [cx, cy] = s.at ?? [x + w / 2, y + h / 2];
          const name = labelLines(room.name, w);
          const song = m?.isLeaderRoom && m.playing ? labelLines(nowPlayingText(m.leader) ?? "", w, FONT * 0.75).slice(0, 3) : [];
          const lines = name.length + song.length;
          const top = cy - (lines * FONT * 1.1) / 2 + FONT * 0.8;
          return (
            <g key={`l${i}`} pointerEvents="none">
              {name.map((line, j) => (
                <text key={j} x={cx} y={top + j * FONT * 1.1} fontSize={FONT} textAnchor="middle" fontWeight={700} fill={m ? "var(--color-ink)" : "var(--color-ink-light)"}>
                  {line}
                </text>
              ))}
              {song.map((line, j) => (
                <text key={`s${j}`} x={cx} y={top + name.length * FONT * 1.1 + j * FONT * 0.9} fontSize={FONT * 0.75} textAnchor="middle" fill={m?.color ?? "var(--color-ink-light)"} fontWeight={600}>
                  {j === 0 ? `🎵 ${line}` : line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/**
 * Musikk på kartet: rommene får fargen til gruppen de spiller i, og det som spilles står i rommet til lederen.
 * Trykk på rom for å velge dem, og «Spill sammen» kobler dem. Under står gruppene med spill/pause og «Velg musikk».
 */
export function MusicMap({ home, groups, onGroup, onSolo, onToggle, onMusic, onSkip, onVolume, onSource, onPick }: Props) {
  const [view, setView] = useState<View>("2");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const rooms = new Map(home.rooms.map((r) => [r.id, r]));
  const music = roomMusic(home.rooms, groups);
  const available = new Set(groups.flatMap((g) => g.speakers).filter((s) => s.status !== "unavailable").map((s) => s.id));
  const inRooms = new Set(home.rooms.flatMap((r) => r.speakers));
  const loose = groups.flatMap((g) => g.speakers).filter((s) => !inRooms.has(s.id) && available.has(s.id));
  const nameOf = (id: string) => home.rooms.find((r) => r.speakers.includes(id))?.name ?? groups.flatMap((g) => g.speakers).find((s) => s.id === id)?.name ?? id;

  const toggle = (ids: string[]) =>
    setSelected((old) => {
      const next = new Set(old);
      const on = ids.some((id) => next.has(id));
      for (const id of ids) {
        if (on) next.delete(id);
        else if (available.has(id)) next.add(id);
      }
      return next;
    });
  const picked = [...selected];
  const pickedNames = [...new Set(picked.map(nameOf))];
  const grouped = picked.filter((id) => groups.some((g) => g.speakers.length > 1 && g.speakers.some((s) => s.id === id)));
  // Spiller de valgte rommene allerede sammen, styres gruppen deres; ellers den som blir leder når de kobles.
  const pickedGroups = groups.filter((g) => g.speakers.some((s) => selected.has(s.id)));
  const together = pickedGroups.length === 1;
  const speakerOf = (id: string) => groups.flatMap((g) => g.speakers).find((s) => s.id === id);
  const leader = together ? pickedGroups[0].leader : speakerOf(planGroup(groups, picked)?.leader ?? picked[0] ?? "");
  const colored = coloredGroups(groups).sort((a, b) => a.leader.id.localeCompare(b.leader.id));
  const floors = FLOORS.filter((f) => f.shapes.some((s) => rooms.get(s.room)?.speakers.length));
  const done = (f: () => void) => () => (f(), setSelected(new Set()));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 lg:hidden" role="tablist" aria-label="Velg etasje">
        {floors.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={view === f.id}
            onClick={() => setView(f.id)}
            className={`min-h-10 rounded-full border-2 px-4 text-sm font-bold transition ${view === f.id ? "border-primary bg-primary-soft text-primary-dark" : "border-line bg-card"}`}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-card p-2 shadow-[0_2px_12px_rgba(120,90,60,0.08)]">
        <div className="lg:hidden">
          <MusicFloor floor={floors.find((f) => f.id === view) ?? floors[0]} rooms={rooms} music={music} selected={selected} onPick={(r) => toggle(r.speakers)} />
        </div>
        <div className="hidden gap-4 lg:grid" style={{ gridTemplateColumns: floors.map((f) => `${(f.viewBox ?? VIEWBOX).w}fr`).join(" ") }}>
          {floors.map((f) => (
            <MusicFloor key={f.id} floor={f} rooms={rooms} music={music} selected={selected} onPick={(r) => toggle(r.speakers)} />
          ))}
        </div>
        {loose.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1 pt-2">
            {loose.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={selected.has(s.id)}
                onClick={() => toggle([s.id])}
                className={`min-h-10 rounded-full border-2 px-3 text-sm font-semibold ${selected.has(s.id) ? "border-primary bg-primary-soft text-primary-dark" : "border-line bg-card"}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
        <p className="px-1 pt-1 text-xs text-ink-light">Samme farge = spiller sammen. Trykk på rommene du vil ha med, og velg «Spill sammen».</p>
      </div>

      {picked.length > 0 && (
        <section aria-label="Valgte rom" className="sticky bottom-20 z-20 flex max-h-[65dvh] flex-col gap-2 overflow-y-auto rounded-2xl border-2 border-primary bg-card px-3 py-2 shadow-lg md:bottom-4">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-sm font-semibold wrap-break-word">{pickedNames.join(", ")}</p>
            {!together && (
              <button type="button" onClick={() => onGroup(picked)} className="min-h-10 rounded-full bg-primary px-4 text-sm font-bold text-white">
                Spill sammen
              </button>
            )}
            {grouped.length > 0 && (
              <button type="button" onClick={done(() => onSolo(grouped))} className="flex min-h-10 items-center gap-1 rounded-full border-2 border-line bg-card px-3 text-sm font-semibold">
                <Unlink size={14} aria-hidden />
                Spill alene
              </button>
            )}
            <button type="button" onClick={() => setSelected(new Set())} aria-label="Fjern valget" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-light">
              <X size={18} aria-hidden />
            </button>
          </div>
          {leader && (
            <>
              <div className="flex items-center gap-3">
                <Cover speaker={leader} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-light wrap-break-word">{nowPlaying(leader)}</p>
                  {!together && <p className="text-xs text-ink-light">Velger du musikk her, spiller rommene sammen.</p>}
                </div>
                {together && <PlayButton playing={leader.status === "playing"} onClick={() => onToggle(leader)} label={pickedNames.join(", ")} />}
              </div>
              {/* Samme valg som i lista: forrige/neste, «Velg musikk» og favorittene. */}
              <Details leader={leader} actions={{ onSkip, onMusic: () => onPick(picked), onSource: (_, source) => onSource(picked, source) }} />
              <ul className="flex flex-col gap-1">
                {picked.map((id) => {
                  const sp = speakerOf(id);
                  return sp ? (
                    <li key={id} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-xs font-semibold wrap-break-word">{sp.name}</span>
                      <div className="flex min-w-0 flex-1">
                        <VolumeSlider speaker={sp} onVolume={onVolume} />
                      </div>
                    </li>
                  ) : null;
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {colored.length > 0 && (
        <ul aria-label="Det som spilles" className="flex flex-col divide-y-2 divide-line overflow-hidden rounded-2xl bg-card shadow-[0_2px_12px_rgba(120,90,60,0.08)]">
          {colored.map((g, i) => {
            const color = GROUP_COLORS[i % GROUP_COLORS.length];
            const text = nowPlayingText(g.leader);
            return (
              <li key={g.leader.id} className="flex items-center gap-3 px-3 py-2">
                <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold wrap-break-word">{groupName(g)}</p>
                  <p className="text-xs text-ink-light wrap-break-word">{g.leader.status === "playing" ? (text ?? "Spiller") : `Pause${text ? ` · ${text}` : ""}`}</p>
                </div>
                <button type="button" onClick={() => onMusic(g.leader)} aria-label={`Velg musikk i ${groupName(g)}`} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-line bg-card">
                  <ListMusic size={18} aria-hidden />
                </button>
                <PlayButton playing={g.leader.status === "playing"} onClick={() => onToggle(g.leader)} label={groupName(g)} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
