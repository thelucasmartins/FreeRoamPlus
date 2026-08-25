/** Shared Overpass API query helper for the pipeline scripts. */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const MAX_RETRIES = 5;

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  /** Present on ways/relations queried with `out geom`. */
  geometry?: { lat: number; lon: number }[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Queries Overpass, retrying with backoff on 429 (rate limited — the
 * public instance uses a fair-use slot system, and one big query can eat
 * into it for a while) and 504 (gateway timeout — transient server load).
 * Anything else fails immediately rather than retrying blindly.
 */
export async function queryOverpass(query: string): Promise<OverpassElement[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const waitMs = Math.min(60000, 5000 * 2 ** (attempt - 1));
      console.log(`  retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`);
      await sleep(waitMs);
    }

    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      // Overpass's Apache front-end 406s requests with no User-Agent at all
      // (Node's fetch sends none by default, unlike curl) -- identify
      // honestly rather than spoofing a browser UA.
      headers: {
        'Content-Type': 'text/plain',
        'User-Agent': 'FreeRoamPlus-pipeline/1.0 (offline nav app data pipeline; contact: lucas.martins9991233@gmail.com)',
      },
      body: query,
    });

    if (res.ok) {
      const body = (await res.json()) as { elements: OverpassElement[] };
      return body.elements;
    }

    const text = await res.text();
    lastError = new Error(`Overpass HTTP ${res.status}: ${text.slice(0, 300)}`);
    if (res.status !== 429 && res.status !== 504) throw lastError;
  }

  throw lastError ?? new Error('Overpass query failed with no response');
}

export function toCoordinates(geometry: { lat: number; lon: number }[]): [number, number][] {
  return geometry.map((p) => [p.lon, p.lat]);
}
