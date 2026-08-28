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

/** Mirrors OverlaySource's discriminant. Roads and search only ever use 'file' or 'sample'. */
export type OverlayLoadMode = 'tiles' | 'file' | 'sample';

export interface OverlayLoadMetric {
  /** Which overlay this measured. */
  id: string;
  /** How the data reached the app. `tiles` means no GeoJSON parse happened at all. */
  mode: OverlayLoadMode;
  /** Size of the on-device file in bytes, or null when bundled sample data was used. */
  fileSizeBytes: number | null;
  /** Time spent reading + JSON-parsing the file. Always 0 in `tiles` mode — that's the point. */
  parseMs: number;
  /** Time spent in post-parse work (e.g. road classification), if any. */
  postProcessMs: number | null;
  /** Total wall-clock time for the load call. */
  totalMs: number;
  /** Feature/entry count, when the shape makes it cheap to determine. */
  featureCount: number | null;
  measuredAt: number;
}

const metrics = new Map<string, OverlayLoadMetric>();

type MetricListener = (metric: OverlayLoadMetric) => void;
const listeners = new Set<MetricListener>();

/**
 * Observe measurements as they're recorded. Returns an unsubscribe function.
 *
 * This exists so persistence can live in src/offline/ (where all document-dir
 * I/O belongs) without this module importing it — which would be a cycle,
 * since the persistence layer reads the metrics from here.
 */
export function subscribeToMetrics(listener: MetricListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function recordLoadMetric(metric: Omit<OverlayLoadMetric, 'measuredAt'>): void {
  const recorded: OverlayLoadMetric = { ...metric, measuredAt: Date.now() };
  metrics.set(metric.id, recorded);

  // Echo to the console in development. docs/DEVICE-VERIFICATION.md step 2
  // tells the operator to read these numbers off the Metro console during
  // the device pass, so they have to actually appear there. Persisted
  // separately — see src/offline/metricsLog.ts.
  if (__DEV__) {
    console.log(formatLoadMetric(recorded));
  }

  for (const listener of listeners) {
    try {
      listener(recorded);
    } catch {
      // A failing observer must never break the load that produced the
      // measurement. Diagnostics are strictly a side effect here.
    }
  }
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

/**
 * One-line summary per overlay, for the Metro console or a debug panel.
 *
 * Shape is fixed by docs/DEVICE-VERIFICATION.md, which tells the operator
 * what to look for during the device pass:
 *
 *   roads [file]: 47.0MB — parse 3120ms, classify 890ms, 119071 features
 *   structures [tiles]: 38.9MB — parse 0ms
 */
export function formatLoadMetric(m: OverlayLoadMetric): string {
  const size = m.fileSizeBytes === null ? m.mode : `${(m.fileSizeBytes / (1024 * 1024)).toFixed(1)}MB`;
  const parts = [`parse ${m.parseMs}ms`];
  if (m.postProcessMs !== null) parts.push(`classify ${m.postProcessMs}ms`);
  if (m.featureCount !== null) parts.push(`${m.featureCount} features`);
  return `${m.id} [${m.mode}]: ${size} — ${parts.join(', ')}`;
}
