// Sikkerhet fra Homely: alarmstatus, røykvarslere og bevegelse. Alarmen vises bare; appen kan aldri slå den
// av eller på (Home Assistant tilbyr det heller ikke for Homely). Rene funksjoner uten nettverk.

import { ROOMS, type RoomConfig } from "./rooms";

interface StateLike {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export type AlarmState = "disarmed" | "armed_home" | "armed_away" | "armed_night" | "armed_vacation" | "arming" | "pending" | "triggered" | "unavailable";

export interface Alarm {
  id: string;
  state: AlarmState | string;
  /** «Av», «På (hjemme)», «Utløst» … */
  label: string;
  armed: boolean;
  triggered: boolean;
}

export interface SmokeAlarm {
  id: string;
  name: string;
  /** Rommet i romkartet, hvis kjent. */
  roomId: string | null;
  fire: boolean;
  lowBattery: boolean;
  online: boolean;
  temperature: number | null;
}

export interface MotionSensor {
  id: string;
  name: string;
  motion: boolean;
  online: boolean;
}

export interface Safety {
  alarm: Alarm | null;
  smoke: SmokeAlarm[];
  motion: MotionSensor[];
  /** Brann først, så utløst alarm, så batteri og enheter som ikke svarer. */
  problems: string[];
  /** Det haster (brann eller utløst alarm). */
  urgent: boolean;
}

export const NO_SAFETY: Safety = { alarm: null, smoke: [], motion: [], problems: [], urgent: false };

const ALARM_LABEL: Record<string, string> = {
  disarmed: "Av",
  armed_home: "På (hjemme)",
  armed_away: "På (borte)",
  armed_night: "På (natt)",
  armed_vacation: "På (ferie)",
  arming: "Slås på",
  pending: "Venter",
  triggered: "Utløst",
  unavailable: "Svarer ikke",
};

/** Homely-navn som ikke står i romkartet. */
const HOMELY_ROOMS: Record<string, string> = { kid_s_room: "Barnerom", entrance: "Entré", laundry_room: "Vaskerom", kontoret_nede: "Kontor 1. etg" };

function homelyName(prefix: string): string {
  const room = prefix.replace(/_(intelligent_smoke_alarm|bevgelsessensor|bevegelsessensor)$/, "");
  return HOMELY_ROOMS[room] ?? room.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function toSafety(states: StateLike[], rooms: RoomConfig[] = ROOMS): Safety {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  const on = (id: string) => byId.get(id)?.state === "on";
  const num = (id: string) => {
    const n = Number(byId.get(id)?.state);
    return byId.has(id) && Number.isFinite(n) ? n : null;
  };

  const alarmState = states.find((s) => s.entity_id.startsWith("alarm_control_panel."));
  const alarm: Alarm | null = alarmState
    ? {
        id: alarmState.entity_id,
        state: alarmState.state,
        label: ALARM_LABEL[alarmState.state] ?? alarmState.state,
        armed: alarmState.state.startsWith("armed_"),
        triggered: alarmState.state === "triggered",
      }
    : null;

  // Røykvarslere: binary_sensor.<prefiks>_brann(_2) med device_class smoke.
  const names = new Map<string, number>();
  const smoke: SmokeAlarm[] = states
    .filter((s) => s.entity_id.startsWith("binary_sensor.") && s.attributes.device_class === "smoke")
    .map((s) => {
      const m = /^binary_sensor\.(.+)_brann(_\d+)?$/.exec(s.entity_id);
      const prefix = m?.[1] ?? s.entity_id.replace(/^binary_sensor\./, "");
      const suffix = m?.[2] ?? "";
      const room = suffix ? undefined : rooms.find((r) => r.smoke === prefix);
      let name = room?.name ?? homelyName(prefix);
      const seen = (names.get(name) ?? 0) + 1;
      names.set(name, seen);
      if (seen > 1) name = `${name} ${seen}`;
      return {
        id: s.entity_id,
        name,
        roomId: room?.id ?? null,
        fire: s.state === "on",
        lowBattery: on(`binary_sensor.${prefix}_lavt_batteri${suffix}`),
        online: s.state !== "unavailable" && byId.get(`binary_sensor.${prefix}_tilkoblet${suffix}`)?.state !== "off",
        temperature: num(`sensor.${prefix}_temperatur${suffix}`),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "nb"));

  // Bevegelse: Homely og andre (Hue). Navnet fra Home Assistant, uten «Bevegelse» og «Sensor».
  const motionNames = new Map<string, number>();
  const motion: MotionSensor[] = states
    .filter((s) => s.entity_id.startsWith("binary_sensor.") && s.attributes.device_class === "motion")
    .map((s) => {
      const prefix = s.entity_id.replace(/^binary_sensor\./, "").replace(/_bevegelse$/, "");
      const friendly = String(s.attributes.friendly_name ?? "").replace(/ Bevegelse$/i, "").replace(/^Sensor /i, "");
      let name = !friendly || /^bev(e)?gelsessensor$/i.test(friendly) ? homelyName(prefix) : friendly.charAt(0).toUpperCase() + friendly.slice(1);
      const seen = (motionNames.get(name) ?? 0) + 1;
      motionNames.set(name, seen);
      if (seen > 1) name = `${name} ${seen}`;
      return { id: s.entity_id, name, motion: s.state === "on", online: s.state !== "unavailable" && byId.get(`binary_sensor.${prefix}_tilkoblet`)?.state !== "off" };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "nb"));

  const fires = smoke.filter((x) => x.fire);
  const problems = [
    ...fires.map((x) => `Brannalarm: røykvarsleren i ${x.name} har gått!`),
    ...(alarm?.triggered ? ["Innbruddsalarmen er utløst!"] : []),
    ...smoke.filter((x) => !x.online).map((x) => `Røykvarsleren i ${x.name} svarer ikke`),
    ...smoke.filter((x) => x.online && x.lowBattery).map((x) => `Røykvarsleren i ${x.name} har lavt batteri`),
  ];
  return { alarm, smoke, motion, problems, urgent: fires.length > 0 || !!alarm?.triggered };
}
