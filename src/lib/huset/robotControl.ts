// Hvilken tjeneste i Home Assistant en robotknapp tilsvarer. Brukes av knappene i Roboter og av «Spør huset».

export type RobotCommand = "start" | "pause" | "home" | "locate";

/** Null når roboten ikke kan det (gressklippere har ikke «finn meg»). */
export function robotService(entityId: string, command: RobotCommand): { domain: string; service: string } | null {
  if (entityId.startsWith("vacuum.")) {
    const service = { start: "start", pause: "pause", home: "return_to_base", locate: "locate" }[command];
    return { domain: "vacuum", service };
  }
  if (entityId.startsWith("lawn_mower.")) {
    const service = { start: "start_mowing", pause: "pause", home: "dock", locate: null }[command];
    return service ? { domain: "lawn_mower", service } : null;
  }
  return null;
}
