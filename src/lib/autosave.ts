export type AutosaveState = "idle" | "saving" | "saved" | "error";

/**
 * Lagrer automatisk mens man skriver (som iOS Notater): venter litt etter siste endring, lagrer bare
 * når innholdet faktisk er endret, og kjører lagringene etter hverandre (aldri to samtidig), slik at
 * en ny oppgave ikke blir opprettet to ganger. `flush()` lagrer med en gang, f.eks. når dialogen lukkes.
 */
export class Autosaver<T> {
  private latest: T;
  private savedKey: string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<boolean> = Promise.resolve(true);

  constructor(
    initial: T,
    private save: (value: T) => Promise<boolean>,
    private opts: { key?: (value: T) => string; delay?: number; onState?: (s: AutosaveState) => void } = {}
  ) {
    this.latest = initial;
    this.savedKey = this.keyOf(initial);
  }

  private keyOf(value: T): string {
    return this.opts.key ? this.opts.key(value) : JSON.stringify(value);
  }

  /** Nytt innhold fra skjemaet. Lagres etter en kort pause hvis det er endret. */
  update(value: T): void {
    this.latest = value;
    this.clearTimer();
    if (this.keyOf(value) === this.savedKey) return;
    this.timer = setTimeout(() => void this.flush(), this.opts.delay ?? 700);
  }

  get dirty(): boolean {
    return this.keyOf(this.latest) !== this.savedKey;
  }

  flush(): Promise<boolean> {
    this.clearTimer();
    this.chain = this.chain.then(async () => {
      const value = this.latest;
      const key = this.keyOf(value);
      if (key === this.savedKey) return true;
      this.opts.onState?.("saving");
      let ok = false;
      try {
        ok = await this.save(value);
      } catch {
        ok = false;
      }
      if (ok) this.savedKey = key;
      this.opts.onState?.(ok ? "saved" : "error");
      return ok;
    });
    return this.chain;
  }

  dispose(): void {
    this.clearTimer();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
