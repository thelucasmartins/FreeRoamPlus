import type { SearchEntry, SearchIndex } from '../overlays/searchTypes';

const DEFAULT_LIMIT = 8;

/**
 * Case-insensitive name search over the offline index (spec §16): exact
 * matches first, then prefix matches, then substring matches, alphabetical
 * within each group. No fuzzy matching — the index is small and local, and
 * users are typing a name they already know.
 */
export function searchIndex(index: SearchIndex, query: string, limit = DEFAULT_LIMIT): SearchEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const ranked: { entry: SearchEntry; rank: number }[] = [];
  for (const entry of index) {
    // A hand-edited or partially-written index file could carry an entry
    // missing `name` — skip it instead of throwing and taking the whole
    // search bar down with it.
    if (typeof entry?.name !== 'string') continue;
    const name = entry.name.toLowerCase();
    let rank: number;
    if (name === normalizedQuery) rank = 0;
    else if (name.startsWith(normalizedQuery)) rank = 1;
    else if (name.includes(normalizedQuery)) rank = 2;
    else continue;
    ranked.push({ entry, rank });
  }

  ranked.sort((a, b) => a.rank - b.rank || a.entry.name.localeCompare(b.entry.name));
  return ranked.slice(0, limit).map((r) => r.entry);
}
