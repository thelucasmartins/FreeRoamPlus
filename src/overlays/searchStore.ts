import { File, Paths } from 'expo-file-system';

import { OVERLAYS_DIR_NAME, SEARCH_INDEX_FILENAME } from '../config';
import { recordLoadMetric, startTimer } from './loadMetrics';
import { SAMPLE_SEARCH_INDEX } from './sampleSearchIndex';
import type { SearchIndex } from './searchTypes';

export interface SearchIndexResult {
  index: SearchIndex;
  /** True when this is the bundled placeholder set, not a real pipeline export. */
  isSample: boolean;
}

function searchIndexFile(): File {
  return new File(Paths.document, OVERLAYS_DIR_NAME, SEARCH_INDEX_FILENAME);
}

function sampleResult(elapsed: () => number): SearchIndexResult {
  recordLoadMetric({
    id: 'searchIndex',
    fileSizeBytes: null,
    parseMs: 0,
    postProcessMs: null,
    totalMs: elapsed(),
    isSample: true,
    featureCount: SAMPLE_SEARCH_INDEX.length,
  });
  return { index: SAMPLE_SEARCH_INDEX, isSample: true };
}

/**
 * Loads the search index: real pipeline output if it's been placed
 * on-device at overlays/search-index.json, otherwise the bundled sample.
 */
export async function loadSearchIndex(): Promise<SearchIndexResult> {
  const elapsed = startTimer();
  try {
    const file = searchIndexFile();
    if (!file.exists) {
      return sampleResult(elapsed);
    }
    const fileSizeBytes = file.size ?? null;
    const parseStart = Date.now();
    const index = (await file.json()) as SearchIndex;
    const parseMs = Date.now() - parseStart;

    recordLoadMetric({
      id: 'searchIndex',
      fileSizeBytes,
      parseMs,
      postProcessMs: null,
      totalMs: elapsed(),
      isSample: false,
      featureCount: Array.isArray(index) ? index.length : null,
    });
    return { index, isSample: false };
  } catch {
    // Also covers a native fs error from `.exists` itself, not just a JSON
    // parse failure.
    return sampleResult(elapsed);
  }
}
