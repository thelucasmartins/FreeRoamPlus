import { Directory, File } from 'expo-file-system';

import {
  GLYPH_FONTSTACK,
  GLYPH_RANGES,
  GLYPHS_DIR_NAME,
  GLYPHS_DOWNLOAD_BASE_URL,
} from '../config';
import { downloadFileTo, type DownloadProgressInfo } from './fileDownload';
import { tilesDir } from './tileSets';

/**
 * On-device font glyphs, without which the map has no text on it at all.
 *
 * MapLibre Native resolves a style's `glyphs` template to
 * `<fontstack>/<range>.pbf` and cannot render a `symbol` layer any other
 * way — there is no system-font fallback for Latin script. So this is not a
 * cosmetic enhancement: with no glyph pack installed, `buildLabelLayers()`
 * returns an empty array, the style drops its `glyphs` key, and every road
 * name and place name disappears. A navigation map with no street names
 * still looks plausible, which is exactly why the gap went unnoticed.
 *
 * Delivered as individual range files rather than an archive because
 * expo-file-system cannot unzip, and because the ranges are independently
 * useful — each is a few tens of KB, and only the ones listed in
 * GLYPH_RANGES are ever fetched.
 */

/** Smallest plausible glyph range file. A real one is tens of KB; an error page or a truncated transfer is not. */
const MIN_GLYPH_RANGE_BYTES = 1024;

export interface GlyphsStatus {
  /** True when every required range is present and plausibly sized. */
  ready: boolean;
  /** file:// template for the style's `glyphs` key, if ready. */
  glyphsUrl: string | null;
  /** Which ranges are installed — the diagnostic that distinguishes "none" from "partial". */
  installedRanges: string[];
  /** Total bytes on disk across installed ranges. */
  sizeBytes: number;
}

/** tiles/fonts — the directory the style's glyph template points into. */
export function glyphsDir(): Directory {
  return new Directory(tilesDir(), GLYPHS_DIR_NAME);
}

/** tiles/fonts/<fontstack> — one directory per stack, named exactly as `text-font` spells it. */
function fontstackDir(): Directory {
  return new Directory(glyphsDir(), GLYPH_FONTSTACK);
}

function rangeFile(range: string): File {
  return new File(fontstackDir(), `${range}.pbf`);
}

/**
 * Whether the glyph pack is on-device AND complete.
 *
 * Checks every required range rather than the directory's existence, which
 * is the mistake this replaces: a `fonts/` directory is created by the first
 * write, so an interrupted install left the directory present, labels
 * switched on, and MapLibre requesting range files that were never fetched.
 * Presence of a container has never been evidence that its contents arrived
 * (see tileSets.ts for the same lesson on empty SQLite shells).
 */
export function getGlyphsStatus(): GlyphsStatus {
  const installedRanges: string[] = [];
  let sizeBytes = 0;

  for (const range of GLYPH_RANGES) {
    const file = rangeFile(range);
    if (!file.exists) continue;
    const size = file.size ?? 0;
    if (size < MIN_GLYPH_RANGE_BYTES) continue;
    installedRanges.push(range);
    sizeBytes += size;
  }

  const ready = installedRanges.length === GLYPH_RANGES.length;
  const dirUri = glyphsDir().uri.replace(/\/$/, '');

  return {
    ready,
    // MapLibre substitutes {fontstack} and {range} itself; the template is
    // handed over with the placeholders intact.
    glyphsUrl: ready ? `${dirUri}/{fontstack}/{range}.pbf` : null,
    installedRanges,
    sizeBytes,
  };
}

/**
 * Fetches every required range. Failures are collected rather than thrown so
 * one bad range doesn't abandon the others — but the status returned is only
 * `ready` when all of them landed, so a partial install can't switch labels
 * on.
 */
export async function downloadGlyphs(
  onProgress?: (range: string, info: DownloadProgressInfo) => void,
): Promise<{ status: GlyphsStatus; failures: { range: string; error: string }[] }> {
  const dir = fontstackDir();
  const failures: { range: string; error: string }[] = [];

  for (const range of GLYPH_RANGES) {
    // The fontstack has spaces in it; they must be percent-encoded in the URL
    // but left alone in the on-device directory name above.
    const url = `${GLYPHS_DOWNLOAD_BASE_URL}/${encodeURIComponent(GLYPH_FONTSTACK)}/${range}.pbf`;
    try {
      await downloadFileTo(dir, `${range}.pbf`, url, (info) => onProgress?.(range, info));
    } catch (e) {
      failures.push({ range, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { status: getGlyphsStatus(), failures };
}

/** Remove the whole glyph pack, so a bad install can be replaced. */
export function deleteGlyphs(): void {
  const dir = glyphsDir();
  if (dir.exists) {
    dir.delete();
  }
}
