// Små tegninger av enhetene i huset (egne, ikke produsentbilder), i samme lyse stil som resten av appen.
// Alle tegnes i en 48 × 48-rute med mørk strek, lys flate og én farge per type. `active` gir full farge
// (spiller, vanner, kjører …), ellers er fargen dempet, og `off` gjør tegningen blek og grå.

export type DeviceKind =
  | "speaker"
  | "vacuum"
  | "mower"
  | "valve"
  | "washer"
  | "dryer"
  | "dishwasher"
  | "oven"
  | "car"
  | "smoke"
  | "air"
  | "motion"
  | "alarm"
  | "meter";

const ACCENT: Record<DeviceKind, string> = {
  speaker: "#9b51e0",
  vacuum: "#2f80ed",
  mower: "#27a376",
  valve: "#3b9fd8",
  washer: "#2f80ed",
  dryer: "#e8891f",
  dishwasher: "#27a376",
  oven: "#e0573f",
  car: "#2f80ed",
  smoke: "#e05a4f",
  air: "#27a376",
  motion: "#6d8a12",
  alarm: "#2f80ed",
  meter: "#0f9fb3",
};

const LINE = "#5f566f";
const BODY = "#f7f2eb";

function Shape({ kind, accent }: { kind: DeviceKind; accent: string }) {
  const s = { stroke: LINE, strokeWidth: 1.8, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  switch (kind) {
    case "speaker":
      return (
        <>
          <rect x={14} y={5} width={20} height={38} rx={7} fill={BODY} {...s} />
          {[0, 1, 2, 3, 4, 5].map((r) => [0, 1, 2].map((c) => <circle key={`${r}${c}`} cx={19 + c * 5} cy={20 + r * 3.6} r={0.9} fill={LINE} opacity={0.55} />))}
          <circle cx={24} cy={11.5} r={2.2} fill={accent} />
        </>
      );
    case "vacuum":
      return (
        <>
          <circle cx={24} cy={26} r={18} fill={BODY} {...s} />
          <path d="M 10 22 A 15 15 0 0 1 38 22" fill="none" stroke={accent} strokeWidth={3} strokeLinecap="round" />
          <circle cx={24} cy={21} r={5.5} fill="#ffffff" {...s} />
          <circle cx={24} cy={21} r={2} fill={accent} />
          <circle cx={24} cy={34} r={1.6} fill={LINE} opacity={0.5} />
        </>
      );
    case "mower":
      return (
        <>
          <path d="M 24 8 V 14" {...s} fill="none" />
          <circle cx={24} cy={7} r={2.2} fill={accent} />
          <path d="M 7 34 Q 7 17 24 15 Q 41 17 41 34 Z" fill={accent} fillOpacity={0.85} {...s} />
          <path d="M 13 27 Q 24 21 35 27" fill="none" stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round" opacity={0.8} />
          <circle cx={13} cy={36} r={5} fill="#3a3445" />
          <circle cx={35} cy={36} r={5} fill="#3a3445" />
          <circle cx={13} cy={36} r={1.8} fill="#cfc8d8" />
          <circle cx={35} cy={36} r={1.8} fill="#cfc8d8" />
        </>
      );
    case "valve":
      return (
        <>
          <rect x={4} y={24} width={12} height={8} rx={2} fill="#ffffff" {...s} />
          <rect x={32} y={24} width={12} height={8} rx={2} fill="#ffffff" {...s} />
          <rect x={14} y={14} width={20} height={24} rx={6} fill={BODY} {...s} />
          <rect x={18} y={18} width={12} height={6} rx={2} fill={accent} />
          <path d="M 24 29 C 22 32 21 33.5 21 35 A 3 3 0 0 0 27 35 C 27 33.5 26 32 24 29 Z" fill={accent} />
        </>
      );
    case "washer":
    case "dryer":
      return (
        <>
          <rect x={9} y={5} width={30} height={38} rx={5} fill={BODY} {...s} />
          <path d="M 9 13 H 39" {...s} />
          <circle cx={15} cy={9} r={1.4} fill={LINE} />
          <rect x={26} y={7.5} width={9} height={3} rx={1.5} fill={accent} />
          <circle cx={24} cy={28} r={10} fill="#ffffff" {...s} />
          {kind === "washer" ? (
            <path d="M 16 30 Q 20 26 24 30 T 32 30 A 8 8 0 0 1 16 30 Z" fill={accent} opacity={0.85} />
          ) : (
            <path d="M 24 22 A 6 6 0 1 1 18 28 M 24 25 A 3 3 0 1 0 27 28" fill="none" stroke={accent} strokeWidth={2.2} strokeLinecap="round" />
          )}
        </>
      );
    case "dishwasher":
      return (
        <>
          <rect x={9} y={5} width={30} height={38} rx={5} fill={BODY} {...s} />
          <path d="M 9 13 H 39" {...s} />
          <rect x={18} y={8} width={12} height={2.4} rx={1.2} fill={accent} />
          <path d="M 14 22 H 34 M 14 30 H 34" stroke={LINE} strokeWidth={1.4} strokeLinecap="round" opacity={0.6} />
          {[17, 21, 25, 29].map((x) => (
            <path key={x} d={`M ${x} 22 V 18`} stroke={accent} strokeWidth={2} strokeLinecap="round" />
          ))}
          <circle cx={20} cy={34} r={3} fill="#ffffff" stroke={accent} strokeWidth={1.6} />
          <circle cx={28} cy={34} r={3} fill="#ffffff" stroke={accent} strokeWidth={1.6} />
        </>
      );
    case "oven":
      return (
        <>
          <rect x={7} y={7} width={34} height={34} rx={5} fill={BODY} {...s} />
          <path d="M 7 15 H 41" {...s} />
          <circle cx={14} cy={11} r={1.6} fill={LINE} />
          <circle cx={20} cy={11} r={1.6} fill={LINE} />
          <rect x={27} y={9.5} width={10} height={3} rx={1} fill={accent} />
          <rect x={12} y={19} width={24} height={17} rx={3} fill="#3a3445" />
          <path d="M 16 31 Q 20 25 24 31 Q 28 25 32 31" fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" />
        </>
      );
    case "car":
      return (
        <>
          <path d="M 4 32 V 27 Q 4 24 7 23.5 L 13 22 L 19 15 Q 21 13 24 13 H 31 Q 34 13 36 15.5 L 40 21 L 42 22 Q 44 23 44 26 V 32 Z" fill={accent} fillOpacity={0.9} {...s} />
          <path d="M 20 21 L 23.5 16.5 H 30.5 L 34 21 Z" fill="#dfeaf9" />
          <circle cx={13} cy={33} r={5} fill="#3a3445" />
          <circle cx={35} cy={33} r={5} fill="#3a3445" />
          <circle cx={13} cy={33} r={1.8} fill="#cfc8d8" />
          <circle cx={35} cy={33} r={1.8} fill="#cfc8d8" />
          <path d="M 7 37 H 41" stroke={LINE} strokeWidth={1.4} strokeLinecap="round" opacity={0.3} />
        </>
      );
    case "smoke":
      return (
        <>
          <ellipse cx={24} cy={26} rx={18} ry={14} fill={BODY} {...s} />
          <ellipse cx={24} cy={24} rx={9} ry={6} fill="#ffffff" {...s} />
          {[-4, 0, 4].map((dx) => (
            <path key={dx} d={`M ${24 + dx} 21 V 27`} stroke={LINE} strokeWidth={1.4} strokeLinecap="round" opacity={0.5} />
          ))}
          <circle cx={34} cy={33} r={2.2} fill={accent} />
        </>
      );
    case "air":
      return (
        <>
          <rect x={10} y={8} width={28} height={32} rx={9} fill={BODY} {...s} />
          <path d="M 16 20 H 28 A 3 3 0 1 0 25 17" fill="none" stroke={accent} strokeWidth={2.2} strokeLinecap="round" />
          <path d="M 16 26 H 32 A 3 3 0 1 1 29 29" fill="none" stroke={accent} strokeWidth={2.2} strokeLinecap="round" />
          <circle cx={24} cy={35} r={1.5} fill={LINE} opacity={0.5} />
        </>
      );
    case "motion":
      return (
        <>
          <rect x={12} y={8} width={24} height={32} rx={6} fill={BODY} {...s} />
          <path d="M 16 24 A 8 8 0 0 1 32 24 Z" fill="#ffffff" {...s} />
          <path d="M 18 22 A 6 6 0 0 1 30 22" fill="none" stroke={accent} strokeWidth={1.6} opacity={0.7} />
          <circle cx={24} cy={33} r={1.8} fill={accent} />
        </>
      );
    case "alarm":
      return (
        <>
          <path d="M 24 5 L 39 11 V 23 Q 39 36 24 43 Q 9 36 9 23 V 11 Z" fill={BODY} {...s} />
          <path d="M 24 10 L 34 14 V 23 Q 34 32 24 37 Z" fill={accent} opacity={0.85} />
          <circle cx={19} cy={22} r={2.4} fill="none" stroke={LINE} strokeWidth={1.6} />
          <path d="M 19 24.5 V 29" stroke={LINE} strokeWidth={1.6} strokeLinecap="round" />
        </>
      );
    case "meter":
      return (
        <>
          <rect x={10} y={10} width={28} height={28} rx={8} fill={BODY} {...s} />
          <path d="M 26 15 L 18 26 H 24 L 22 34 L 30 22 H 24 Z" fill={accent} stroke={LINE} strokeWidth={1.2} strokeLinejoin="round" />
        </>
      );
  }
}

/** Tegning av en enhet. `active` gir sterk farge (i gang), ellers dempet; `off` = svarer ikke. */
export function DeviceArt({ kind, size = 36, active = true, off = false, className = "" }: { kind: DeviceKind; size?: number; active?: boolean; off?: boolean; className?: string }) {
  // I ro: samme farge, men dempet (røykvarsleren får grønn lampe når alt er OK).
  const accent = active ? ACCENT[kind] : kind === "smoke" ? "#2e9d57" : `${ACCENT[kind]}99`;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden className={`shrink-0 ${off ? "opacity-40 grayscale" : ""} ${className}`}>
      <Shape kind={kind} accent={accent} />
    </svg>
  );
}
