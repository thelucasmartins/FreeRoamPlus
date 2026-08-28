/**
 * How an overlay's data reaches the map — the contract between the stores
 * (which resolve what's on the device) and the map components (which render
 * it).
 *
 * This exists because the two large overlays moved to vector tiles, and a
 * naive migration would have fixed nothing: the stores previously read the
 * on-device GeoJSON whenever it was present, so a device holding both
 * `structures.mbtiles` and `structures.geojson` would render from tiles and
 * *still* take the ~102MB parse the migration was meant to eliminate. The
 * mode has to be decided in one place, before any file is read, and carried
 * to the renderer — hence a discriminated union rather than a data payload
 * plus flags.
 *
 * Resolution order in a store is therefore: tiles present -> `tiles`,
 * returning **without reading the GeoJSON at all**; else a real file on
 * device -> `file`; else the bundled sample -> `sample`.
 */
export type OverlaySource<T> =
  /** Real data, streamed from an on-device MBTiles database by viewport. No parse. */
  | { mode: 'tiles'; tileUrl: string; sourceLayer: string }
  /** Real data, parsed from an on-device GeoJSON file. No tiles available. */
  | { mode: 'file'; data: T }
  /** Bundled placeholder data — nothing real is on the device yet. */
  | { mode: 'sample'; data: T };

/**
 * Whether the map is showing placeholder rather than real data, for the
 * legend's "Sample data" badge. Replaces the separate `isSample` flag the
 * stores used to return alongside their payload.
 */
export function isSampleSource<T>(source: OverlaySource<T>): boolean {
  return source.mode === 'sample';
}
