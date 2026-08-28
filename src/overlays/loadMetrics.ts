/**
 * Load timing for the overlay files (spec §9).
 *
 * The overlay data ranges from an 18KB elevation grid to a 100MB+ structures
 * export, and `await file.json()` on the large end is the suspected cause of
 * the previous project's failure (docs/DATA.md §6). Deciding which files
 * genuinely need the vector-tile treatment requires real on-device numbers,
 * not desktop guesses — a laptop parsing 47MB of JSON tells you nothing
 * about what an iPhone does with it.
 *
 * This records what each load actually cost so the data screen can surface
 * it. Recording is best-effort and must never affect whether a load
 * succeeds: every call site treats metrics as write-and-forget.
 */

export interface OverlayLoadMetric {
  /** Which overlay this measured. */
  id: string;
  /** Size of the on-device file in bytes, or null when the sample data was used. */
  fileSizeBytes: number | null;
  /** Time spent reading + JSON-parsing the file. */
  parseMs: number;
  /** Time spent in post-parse work (e.g. road classification), if any. */
  postProcessMs: number | null;
  /** Total wall-clock time for the load call. */
  totalMs: number;
  /** True when this measured the bundled sample data rather than real pipeline output. */
  isSample: boolean;
  /** Feature/entry count, when the shape makes it cheap to determine. */
  featureCount: number | null;
  measuredAt: number;
}

const metrics = new Map<string, OverlayLoadMetric>();

export function recordLoadMetric(metric: Omit<OverlayLoadMetric, 'measuredAt'>): void {
  metrics.set(metric.id, { ...metric, measuredAt: Date.now() });
}

export function getLoadMetric(id: string): OverlayLoadMetric | null {
  return metrics.get(id) ?? null;
}

export function getAllLoadMetrics(): OverlayLoadMetric[] {
  return [...metrics.values()];
}

/** Monotonic-ish elapsed-time helper, so call sites stay readable. */
export function startTimer(): () => number {
  const t0 = Date.now();
  return () => Date.now() - t0;
}

/** One-line summary per overlay, for logging or a debug panel. */
export function formatLoadMetric(m: OverlayLoadMetric): string {
  const size = m.fileSizeBytes === null ? 'sample' : `${(m.fileSizeBytes / (1024 * 1024)).toFixed(1)}MB`;
  const post = m.postProcessMs === null ? '' : ` +${m.postProcessMs}ms post`;
  const count = m.featureCount === null ? '' : ` (${m.featureCount} features)`;
  return `${m.id}: ${size}${count} — ${m.parseMs}ms parse${post}, ${m.totalMs}ms total`;
}
