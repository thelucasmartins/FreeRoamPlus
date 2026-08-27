import { File, Paths } from 'expo-file-system';

import { OVERLAYS_DIR_NAME, SEARCH_INDEX_FILENAME } from '../config';
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

/**
 * Loads the search index: real pipeline output if it's been placed
 * on-device at overlays/search-index.json, otherwise the bundled sample.
 */
export async function loadSearchIndex(): Promise<SearchIndexResult> {
  try {
    const file = searchIndexFile();
    if (!file.exists) {
      return { index: SAMPLE_SEARCH_INDEX, isSample: true };
    }
    const index = (await file.json()) as SearchIndex;
    return { index, isSample: false };
  } catch {
    // Also covers a native fs error from `.exists` itself, not just a JSON
    // parse failure.
    return { index: SAMPLE_SEARCH_INDEX, isSample: true };
  }
}
