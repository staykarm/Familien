"use client";

import { BatteryMedium, Home, MapPin, Pause, Play, TriangleAlert, Wrench } from "lucide-react";
import type { Robot } from "@/lib/huset/robots";
import type { HomeCommand } from "@/lib/validation/huset";
import { IconButton } from "./parts";
import { usePending } from "./usePending";

interface Props {
  robots: Robot[];
  run: (cmd: HomeCommand) => Promise<void>;
}

const STATUS_AFTER: Record<string, Partial<Robot>> = {
  start: { active: true, status: "Starter …" },
  pause: { active: false, status: "Pause" },
  home: { active: true, status: "På vei hjem" },
};

/** Én robot: navn, status, batteri og rom; feil og vedlikehold under; start/pause/hjem (og «finn meg»). */
function RobotRow({ robot, pending, run }: { robot: Robot; pending: ReturnType<typeof usePending<Robot>>; run: Props["run"] }) {
  const r = pending.show(robot.id, robot);
  const off = !r.available;
  const command = (command: "start" | "pause" | "home" | "locate") =>
    void pending.send(r.id, STATUS_AFTER[command] ?? {}, () => run({ action: "robot", id: r.id, command }));
  const icon = r.kind === "vacuum" ? "🧹" : "🌱";
  return (
    <li className={`flex flex-col gap-1 border-b border-line py-2 ${off ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold wrap-break-word">{r.name}</p>
          <p className="flex flex-wrap gap-x-2 text-xs text-ink-light">
            <span className={r.active ? "font-bold text-primary-dark" : ""}>{r.status}</span>
            {r.battery !== null && (
              <span className="inline-flex items-center gap-0.5">
                <BatteryMedium size={12} aria-hidden />
                {r.battery} %
              </span>
            )}
            {r.room && <span>i {r.room}</span>}
          </p>
        </div>
        {r.active ? (
          <IconButton onClick={() => command("pause")} label={`Pause ${r.name}`} disabled={off}>
            <Pause size={16} aria-hidden />
          </IconButton>
        ) : (
          <IconButton onClick={() => command("start")} label={`Start ${r.name}`} disabled={off}>
            <Play size={16} aria-hidden />
          </IconButton>
        )}
        <IconButton onClick={() => command("home")} label={`Send ${r.name} hjem`} disabled={off || r.state === "docked"}>
          <Home size={16} aria-hidden />
        </IconButton>
        {r.kind === "vacuum" && (
          <IconButton onClick={() => command("locate")} label={`Finn ${r.name} (den piper)`} disabled={off}>
            <MapPin size={16} aria-hidden />
          </IconButton>
        )}
      </div>
      {r.problems.map((p) => (
        <p key={p} className="flex items-center gap-1.5 pl-7 text-xs font-semibold text-danger">
          <TriangleAlert size={12} className="shrink-0" aria-hidden />
          {p}
        </p>
      ))}
      {r.maintenance.length > 0 && (
        <p className="flex items-start gap-1.5 pl-7 text-xs text-ink-light">
          <Wrench size={12} className="mt-0.5 shrink-0" aria-hidden />
          <span>Bytt eller rengjør nå: {r.maintenance.join(", ")}</span>
        </p>
      )}
    </li>
  );
}

/** Støvsugere og robotgressklippere. Vanning kommer når den er satt opp i Home Assistant. */
export function RobotsTab({ robots, run }: Props) {
  const pending = usePending<Robot>();
  if (!robots.length) return <p className="text-sm text-ink-light">Fant ingen støvsugere eller gressklippere i Home Assistant.</p>;
  const vacuums = robots.filter((r) => r.kind === "vacuum");
  const mowers = robots.filter((r) => r.kind === "mower");
  const list = (items: Robot[], title: string) =>
    items.length > 0 && (
      <section aria-label={title} className="rounded-2xl bg-card px-3 py-1 shadow-[0_2px_12px_rgba(120,90,60,0.08)]">
        <h3 className="pt-1 text-xs font-bold uppercase tracking-wide text-ink-light">{title}</h3>
        <ul className="flex flex-col">
          {items.map((r) => (
            <RobotRow key={r.id} robot={r} pending={pending} run={run} />
          ))}
        </ul>
      </section>
    );
  return (
    <div className="grid items-start gap-2 lg:grid-cols-2">
      {list(vacuums, "Støvsugere")}
      {list(mowers, "Gressklippere")}
    </div>
  );
}
