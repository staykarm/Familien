import type { ReactElement } from "react";

const DOTS = ["#e5739a", "#4f97d9", "#f0a030", "#4fb071"];

/** Felles design for alle genererte appikoner: fire fargeprikker – én per familiemedlem – på varm bakgrunn. */
export function appIconElement(size: number): ReactElement {
  const dot = size * 0.24;
  const gap = size * 0.06;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fff1e0",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", width: dot * 2 + gap, gap }}>
        {DOTS.map((color) => (
          <div key={color} style={{ width: dot, height: dot, borderRadius: dot, background: color }} />
        ))}
      </div>
    </div>
  );
}
