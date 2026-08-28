import { Directory, File, Paths } from 'expo-file-system';

import { DIAGNOSTICS_DIR_NAME, LOAD_METRICS_FILENAME } from '../config';
import { getAllLoadMetrics, subscribeToMetrics } from '../overlays/loadMetrics';
import { formatComparisonReport, type MetricsRun } from '../overlays/loadMetricsReport';

/**
 * Durable storage for the overlay load timings (spec §9).
 *
 * The on-device run produces the only real performance numbers this project
 * will ever have — a desktop parsing 47MB of JSON says nothing about what an
 * iPhone does with it. Until now those numbers landed in the Metro console
 * and nowhere else, which means they existed for exactly as long as someone
 * was watching the terminal, and comparing a before-tiles run against an
 * after-tiles run meant having kept both terminals open.
 *
 * Runs are appended to a JSON file in the app's document directory so a
 * measurement survives the app closing and can be read back afterwards. The
 * analysis itself is in ../overlays/loadMetricsReport.ts, kept free of any
 * filesystem dependency so it stays verifiable without a device.
 *
 * Every operation here is best-effort: diagnostics must never be the reason
 * a map fails to load.
 */

/** How many runs to keep — enough to compare before/after tiles with history to spare, bounded so the file can't grow without limit. */
const MAX_RETAINED_RUNS = 20;

export type { MetricsRun } from '../overlays/loadMetricsReport';

interface MetricsFileShape {
  runs: MetricsRun[];
}

function metricsFile(): File {
  return new File(Paths.document, DIAGNOSTICS_DIR_NAME, LOAD_METRICS_FILENAME);
}

/** Reads the recorded history, or an empty list if there isn't one yet or it's unreadable. */
export async function loadRuns(): Promise<MetricsRun[]> {
  try {
    const file = metricsFile();
    if (!file.exists) return [];
    const parsed = (await file.json()) as MetricsFileShape;
    return Array.isArray(parsed?.runs) ? parsed.runs : [];
  } catch {
    // A corrupt or unreadable diagnostics file isn't worth surfacing —
    // recording a fresh run overwrites it.
    return [];
  }
}

/**
 * Appends whatever has been measured so far as a new run.
 *
 * Returns the saved run, or null if nothing had been measured or the write
 * failed. Callers are expected to ignore the result — this is
 * instrumentation, and it must never affect what the app does.
 */
export async function saveCurrentRun(note?: string): Promise<MetricsRun | null> {
  try {
    const metrics = getAllLoadMetrics();
    if (metrics.length === 0) return null;

    const run: MetricsRun = { recordedAt: Date.now(), note: note ?? null, metrics };
    const existing = await loadRuns();
    const runs = [...existing, run].slice(-MAX_RETAINED_RUNS);

    const dir = new Directory(Paths.document, DIAGNOSTICS_DIR_NAME);
    if (!dir.exists) {
      dir.create({ intermediates: true });
    }

    const file = metricsFile();
    // overwrite:true makes this idempotent whether or not the file exists.
    file.create({ intermediates: true, overwrite: true });
    file.write(JSON.stringify({ runs } as MetricsFileShape, null, 2));

    return run;
  } catch {
    return null;
  }
}

/**
 * Persists a run automatically once measurements stop arriving.
 *
 * Call once at startup; returns a teardown function. The debounce matters:
 * the overlays load as a burst, and saving on each one would write the file
 * repeatedly and record several partial runs instead of one complete
 * snapshot. Waiting for the burst to settle produces a single record
 * containing every overlay that loaded.
 *
 * Without this, saving depends on someone remembering to call
 * saveCurrentRun() at the right moment — which is how these numbers ended up
 * living only in the console in the first place.
 */
export function enableMetricsAutosave(settleMs = 2000): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const unsubscribe = subscribeToMetrics(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void saveCurrentRun('autosave');
    }, settleMs);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}

/** Discards the recorded history (e.g. to start a clean measurement pass). */
export function clearRuns(): void {
  try {
    const file = metricsFile();
    if (file.exists) file.delete();
  } catch {
    // Nothing useful to do; the next save overwrites anyway.
  }
}

/** Reads the history and formats the analysis in one call. */
export async function getComparisonReport(): Promise<string> {
  return formatComparisonReport(await loadRuns());
}
