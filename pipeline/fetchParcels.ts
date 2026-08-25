/**
 * Real parcels pipeline (spec §4, §9). Source: Sonoma County's own public
 * "Parcels Public" ArcGIS FeatureServer (the exact layer named in the
 * spec), found via the county's GIS Hub catalog search — the old
 * gis.sonomacounty.ca.gov/arcgis/rest/services path in the original spec
 * text has since moved.
 *
 * IMPORTANT — confirmed field-check result (spec §4 explicitly asks to
 * "confirm zoning and APN fields are present before building"):
 *   - APN: present (`APN` field) — real.
 *   - Acreage: present (`LandSizeAcres` field) — real.
 *   - Owner name: absent, confirmed — matches spec's CPRA expectation.
 *   - "Zoning designation": NOT present as its own field. This layer only
 *     carries the Assessor's Use Code (`UseCodeDescription`) — a related
 *     but distinct concept (what the parcel is *used for*, not its zoning
 *     district). No standalone public zoning/general-plan layer turned up
 *     in the county's GIS catalog after multiple search attempts. This
 *     pipeline uses UseCodeDescription as the closest available real
 *     substitute — it is NOT a formal zoning designation, and the app's
 *     `zoning` field should be understood as "assessor's use code" until a
 *     real zoning layer is found. Flagged clearly here rather than quietly
 *     relabeling Use Code as "zoning".
 *   - Resource-extraction flag: NOT a separate zoning cross-reference
 *     (spec's described approach), because no zoning layer exists to
 *     cross-reference. Instead, derived directly from UseCodeDescription
 *     text matching real, confirmed values observed in a rural sample
 *     query — "TIMBER PRESERVE ZONE/LIST A/B/C" and "AG PRESERVE AND TPZ"
 *     (TPZ = Timberland Production Zone, the actual CA mechanism spec's
 *     "timber preserve" almost certainly refers to). No mining/quarry
 *     examples were observed in Sonoma County's own data, but the keyword
 *     match includes them for completeness/forward-compatibility.
 *
 * Run: npx tsx pipeline/fetchParcels.ts
 * Output: data/overlays/parcels.geojson
 */
import { mkdirSync, writeFileSync } from 'fs';
import type { ParcelFeatureCollection, ParcelProperties } from '../src/overlays/parcelTypes';

const SERVICE_URL = 'https://socogis.sonomacounty.ca.gov/map/rest/services/CRAPublic/ParcelsPublic/FeatureServer/0/query';
const PAGE_SIZE = 2000;
const OUT_PATH = 'data/overlays/parcels.geojson';

const RESOURCE_EXTRACTION_KEYWORDS = ['TIMBER', 'TPZ', 'MINERAL', 'MINING', 'QUARRY', 'MILL'];

interface EsriAttributes {
  APN: string | null;
  UseCodeDescription: string | null;
  LandSizeAcres: number | null;
}

function isResourceExtraction(useCodeDescription: string | null): boolean {
  if (!useCodeDescription) return false;
  const upper = useCodeDescription.toUpperCase();
  return RESOURCE_EXTRACTION_KEYWORDS.some((kw) => upper.includes(kw));
}

async function fetchPage(offset: number): Promise<GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, EsriAttributes>> {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'APN,UseCodeDescription,LandSizeAcres',
    outSR: '4326',
    geometryPrecision: '6',
    maxAllowableOffset: '0.00005',
    returnGeometry: 'true',
    resultRecordCount: String(PAGE_SIZE),
    resultOffset: String(offset),
    f: 'geojson',
  });
  const res = await fetch(`${SERVICE_URL}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} at offset ${offset}`);
  const body = await res.json();
  if (body.error) throw new Error(`ArcGIS error at offset ${offset}: ${JSON.stringify(body.error)}`);
  return body;
}

async function main() {
  const features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, ParcelProperties>[] = [];
  let offset = 0;
  let skipped = 0;

  for (;;) {
    const page = await fetchPage(offset);
    if (page.features.length === 0) break;

    for (const f of page.features) {
      const { APN, UseCodeDescription, LandSizeAcres } = f.properties;
      if (!APN || LandSizeAcres === null || !f.geometry) {
        skipped++;
        continue;
      }
      const properties: ParcelProperties = {
        apn: APN,
        zoning: UseCodeDescription ?? 'Unknown',
        acres: LandSizeAcres,
        resourceExtraction: isResourceExtraction(UseCodeDescription),
      };
      features.push({ type: 'Feature', geometry: f.geometry, properties });
    }

    offset += page.features.length;
    console.log(`  fetched ${offset} parcels so far (${skipped} skipped for missing fields)...`);

    if (page.features.length < PAGE_SIZE) break; // last page
  }

  const collection: ParcelFeatureCollection = { type: 'FeatureCollection', features };

  mkdirSync('data/overlays', { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(collection));

  const resourceCount = features.filter((f) => f.properties.resourceExtraction).length;
  console.log(`Wrote ${OUT_PATH}: ${features.length} parcels (${resourceCount} flagged resource-extraction, ${skipped} skipped)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
