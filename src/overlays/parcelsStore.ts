import { File, Paths } from 'expo-file-system';

import { OVERLAYS_DIR_NAME, PARCELS_FILENAME, PARCELS_SOURCE_LAYER } from '../config';
import { getOverlayTileStatus } from '../offline/overlayTiles';
import { recordLoadMetric, startTimer } from './loadMetrics';
import type { ParcelFeatureCollection } from './parcelTypes';
import { SAMPLE_PARCELS } from './sampleParcels';
import type { OverlaySource } from './overlaySource';

function parcelsFile(): File {
  return new File(Paths.document, OVERLAYS_DIR_NAME, PARCELS_FILENAME);
}

function sampleResult(elapsed: () => number): OverlaySource<ParcelFeatureCollection> {
  recordLoadMetric({
    id: 'parcels',
    mode: 'sample',
    fileSizeBytes: null,
    parseMs: 0,
    postProcessMs: null,
    totalMs: elapsed(),
    featureCount: SAMPLE_PARCELS.features?.length ?? null,
  });
  return { mode: 'sample', data: SAMPLE_PARCELS };
}

/**
 * Loads the parcels overlay (spec §4), resolving tiles first.
 *
 * Spec §10 flags that this layer previously failed to load/render reliably;
 * the full county export is ~189k features and ~58MB, and parsing that whole
 * into one GeoJSONSource is the suspected cause (docs/DATA.md §6). So when
 * parcels.mbtiles is present we return its URL WITHOUT reading
 * parcels.geojson at all — MapLibre streams the features by viewport
 * instead.
 *
 * Tap-to-inspect is unaffected by the mode: the info card is driven by the
 * source's own onPress event, which VectorSource supports identically to
 * GeoJSONSource, not by a lookup against parsed features.
 *
 * Falls back to the real GeoJSON when no tiles exist, and to bundled sample
 * data when neither does.
 */
export async function loadParcels(): Promise<OverlaySource<ParcelFeatureCollection>> {
  const elapsed = startTimer();

  try {
    const tiles = getOverlayTileStatus('parcels');
    if (tiles.ready && tiles.mbtilesUrl) {
      recordLoadMetric({
        id: 'parcels',
        mode: 'tiles',
        fileSizeBytes: tiles.sizeBytes,
        parseMs: 0,
        postProcessMs: null,
        totalMs: elapsed(),
        featureCount: null,
      });
      return { mode: 'tiles', tileUrl: tiles.mbtilesUrl, sourceLayer: PARCELS_SOURCE_LAYER };
    }
  } catch {
    // A native fs error checking for the tile database shouldn't strand the
    // overlay — fall through to the GeoJSON/sample paths below.
  }

  try {
    const file = parcelsFile();
    if (!file.exists) {
      return sampleResult(elapsed);
    }
    const fileSizeBytes = file.size ?? null;
    const parseStart = Date.now();
    const data = (await file.json()) as ParcelFeatureCollection;
    const parseMs = Date.now() - parseStart;

    recordLoadMetric({
      id: 'parcels',
      mode: 'file',
      fileSizeBytes,
      parseMs,
      postProcessMs: null,
      totalMs: elapsed(),
      featureCount: data.features?.length ?? null,
    });
    return { mode: 'file', data };
  } catch {
    // Also covers a native fs error from `.exists` itself, not just a JSON
    // parse failure.
    return sampleResult(elapsed);
  }
}
