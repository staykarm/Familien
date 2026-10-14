/** Trygt filnavn i lagringsstien (beholder filendelsen). */
export function safeName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(-80) || "fil"
  );
}

/** Lagringssti: «2026-10/<uuid>-<navn>». */
export function storagePath(filename: string, now = new Date()): string {
  return `${now.toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safeName(filename)}`;
}

/** Filtype ut fra filnavnet, for filer som deles uten type (skjer på enkelte telefoner). */
export function guessMime(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    txt: "text/plain",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext] ?? "";
}
