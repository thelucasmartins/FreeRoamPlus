import type { OverlayLoadMetric } from './loadMetrics';

/**
 * Analysis of recorded overlay load timings.
 *
 * Deliberately free of any filesystem dependency — persistence lives in
 * src/offline/metricsLog.ts. Splitting them keeps the part with actual
 * decision logic (which fix does roads need? did the tile migration really
 * remove the parse?) verifiable without a device, which matters because the
 * device run is a single opportunity to collect these numbers and a bug in
 * the analysis would waste it.
 */

export interface MetricsRun {
  recordedAt: number;
  /** Optional caller-supplied label, e.g. which verification step produced this. */
  note: string | null;
  metrics: OverlayLoadMetric[];
}

/**
 * A 'tiles' load performs no JSON parsing by construction — the store sets
 * parseMs to 0 — so anything above a couple of milliseconds of measurement
 * noise means the early return didn't fire and the GeoJSON is still being
 * read.
 */
const TILES_PARSE_TOLERANCE_MS = 5;

function mostRecent(runs: MetricsRun[], id: string, mode: string): OverlayLoadMetric | null {
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const match = runs[i].metrics.find((m) => m.id === id && m.mode === mode);
    if (match) return match;
  }
  return null;
}

function mb(bytes: number | null): string {
  if (bytes === null) return 'sample';
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Before/after comparison for an overlay that moved to vector tiles.
 *
 * This is the number the migration has to justify itself with: if the tiles
 * path didn't actually remove the parse, it fixed nothing. The warning case
 * is the one worth having — a tiles render that still parses the GeoJSON
 * looks completely correct on screen, and this is the only thing that would
 * say otherwise.
 */
function formatTileComparison(runs: MetricsRun[], id: string): string[] {
  const asFile = mostRecent(runs, id, 'file');
  const asTiles = mostRecent(runs, id, 'tiles');
  const lines = [id.toUpperCase()];

  if (!asFile && !asTiles) {
    lines.push('  no real-data measurement recorded (sample data only)');
    return lines;
  }

  lines.push(
    asFile
      ? `  GeoJSON : ${mb(asFile.fileSizeBytes)}, ${asFile.parseMs}ms parse, ${asFile.totalMs}ms total`
      : '  GeoJSON : not measured',
  );
  lines.push(
    asTiles
      ? `  Tiles   : ${mb(asTiles.fileSizeBytes)}, ${asTiles.parseMs}ms parse, ${asTiles.totalMs}ms total`
      : '  Tiles   : not measured',
  );

  if (asFile && asTiles) {
    // Judge the tiles run on its own absolute parse time, NOT on whether it
    // beat the GeoJSON run. A tiles run that parsed 8400ms against a GeoJSON
    // run's 8420ms is a 20ms "saving" and a total failure — the early return
    // isn't firing and the file is still being read. Comparing the two
    // numbers reports that as success, which is the one thing this section
    // must never do.
    const saved = asFile.parseMs - asTiles.parseMs;
    if (asTiles.parseMs > TILES_PARSE_TOLERANCE_MS) {
      lines.push(
        `  -> WARNING: the tiles run still spent ${asTiles.parseMs}ms parsing. In 'tiles' mode the store should return before reading the GeoJSON at all, so the tiles-first early return is not working. The layer will render correctly and the stall will remain.`,
      );
    } else if (saved > 0) {
      lines.push(`  -> parse eliminated: ${saved}ms saved per load`);
    } else {
      lines.push(
        '  -> no measurable saving, but the tiles run did no parsing. Most likely the GeoJSON run was measured against sample data rather than the real file.',
      );
    }
  } else {
    lines.push('  -> need one run of each to compare');
  }

  return lines;
}

/**
 * Roads is the open question this report exists to answer.
 *
 * It's the only large overlay still loading as GeoJSON, because it feeds the
 * routing graph as well as the map and viewport-streamed tiles can't produce
 * a complete graph. If it's too slow, the fix depends entirely on which half
 * is slow: a dominant parse means vector tiles for rendering plus a separate
 * drivable-only extract for routing; a dominant classify means
 * classifyRoads() needs optimising. Those are unrelated pieces of work, and
 * guessing wrong wastes the larger of the two.
 */
function formatRoadsSplit(runs: MetricsRun[]): string[] {
  const roads = mostRecent(runs, 'roads', 'file');
  const lines = ['ROADS  (no tiles path — feeds the routing graph)'];

  if (!roads) {
    lines.push('  no real-data measurement recorded (sample data only)');
    return lines;
  }

  const parse = roads.parseMs;
  const classify = roads.postProcessMs ?? 0;
  const attributed = parse + classify;

  lines.push(`  ${mb(roads.fileSizeBytes)}${roads.featureCount === null ? '' : `, ${roads.featureCount} features`}`);
  lines.push(`  parse    ${parse}ms`);
  lines.push(`  classify ${classify}ms`);
  lines.push(`  total    ${roads.totalMs}ms`);

  if (attributed === 0) {
    lines.push('  -> too fast to attribute; roads is not a problem at this size');
    return lines;
  }

  const parseShare = Math.round((parse / attributed) * 100);
  if (parseShare >= 60) {
    lines.push(
      `  -> parse dominates (${parseShare}%): the fix is vector tiles for rendering plus a separate drivable-only extract for routing. Optimising the classifier would not help.`,
    );
  } else if (parseShare <= 40) {
    lines.push(
      `  -> classification dominates (${100 - parseShare}%): the fix is optimising classifyRoads(). Moving to vector tiles would not help here, and would break the routing graph.`,
    );
  } else {
    lines.push(
      `  -> split roughly evenly (${parseShare}% parse): neither fix alone is sufficient. Decide on the absolute numbers, not the ratio.`,
    );
  }

  return lines;
}

/**
 * Human-readable analysis of the recorded runs — the thing worth reading
 * after a device pass, rather than a dump of raw records.
 */
export function formatComparisonReport(runs: MetricsRun[]): string {
  if (runs.length === 0) {
    return 'No overlay load measurements recorded yet. Run the app with real data on-device first.';
  }

  const latest = new Date(runs[runs.length - 1].recordedAt).toISOString();
  const out: string[] = [
    '=== FreeRoam+ overlay load report ===',
    `${runs.length} run${runs.length === 1 ? '' : 's'} recorded, latest ${latest}`,
    '',
    ...formatTileComparison(runs, 'structures'),
    '',
    ...formatTileComparison(runs, 'parcels'),
    '',
    ...formatRoadsSplit(runs),
    '',
  ];

  const search = mostRecent(runs, 'searchIndex', 'file');
  out.push('SEARCH INDEX');
  out.push(
    search
      ? `  ${mb(search.fileSizeBytes)}, ${search.parseMs}ms parse, ${search.featureCount ?? '?'} entries`
      : '  no real-data measurement recorded',
  );

  return out.join('\n');
}
