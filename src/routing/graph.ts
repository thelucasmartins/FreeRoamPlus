import type { ClassifiedRoadFeatureCollection, RoadCategory } from '../overlays/roadTypes';
import { haversineMeters, nearestPointOnSegment } from './geo';

/**
 * Only these categories are part of the vehicle-routable network (spec
 * §15: "Only paths meeting the drivable-road width threshold are eligible
 * for turn-by-turn routing"). Purple (hiking) and pink (ATV) trails are
 * display-only and never become graph edges — a tap on one falls back to
 * the nearest reachable point on this graph instead (spec §16).
 */
const DRIVABLE_CATEGORIES: ReadonlySet<RoadCategory> = new Set(['green', 'yellow', 'red']);

export interface GraphEdgeRef {
  a: string;
  b: string;
  aCoord: [number, number];
  bCoord: [number, number];
}

export interface RoutingGraph {
  /** node id -> coordinate */
  nodes: Map<string, [number, number]>;
  /** node id -> outgoing edges (undirected: both directions are present) */
  adjacency: Map<string, { to: string; distanceMeters: number }[]>;
  /** flat edge list, for nearest-segment queries */
  edges: GraphEdgeRef[];
}

/** Quantizes to ~0.11m precision so shared endpoints across features merge into one node. */
function nodeId(coord: [number, number]): string {
  return `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
}

function pushAdjacency(
  adjacency: RoutingGraph['adjacency'],
  from: string,
  to: string,
  distanceMeters: number,
) {
  const list = adjacency.get(from);
  if (list) {
    list.push({ to, distanceMeters });
  } else {
    adjacency.set(from, [{ to, distanceMeters }]);
  }
}

/**
 * Builds an undirected routing graph from the classified road/trail
 * collection, keeping only drivable-category features (spec §15). Shared
 * vertices between features (e.g. at intersections, as OSM data naturally
 * produces) merge into a single node via coordinate quantization.
 */
export function buildRoutingGraph(roads: ClassifiedRoadFeatureCollection): RoutingGraph {
  const nodes: RoutingGraph['nodes'] = new Map();
  const adjacency: RoutingGraph['adjacency'] = new Map();
  const edges: GraphEdgeRef[] = [];

  for (const feature of roads.features) {
    if (!DRIVABLE_CATEGORIES.has(feature.properties.category)) continue;

    const coords = feature.geometry.coordinates as [number, number][];
    for (let i = 0; i < coords.length - 1; i++) {
      const aCoord = coords[i];
      const bCoord = coords[i + 1];
      const a = nodeId(aCoord);
      const b = nodeId(bCoord);
      if (a === b) continue;

      nodes.set(a, aCoord);
      nodes.set(b, bCoord);

      const distanceMeters = haversineMeters(aCoord, bCoord);
      pushAdjacency(adjacency, a, b, distanceMeters);
      pushAdjacency(adjacency, b, a, distanceMeters);
      edges.push({ a, b, aCoord, bCoord });
    }
  }

  return { nodes, adjacency, edges };
}

export interface GraphSnap {
  point: [number, number];
  distanceMeters: number;
  edge: GraphEdgeRef;
  /** Set when the nearest point landed essentially on an existing vertex. */
  exactNodeId: string | null;
}

/**
 * Finds the nearest point on the routable network to an arbitrary
 * coordinate — the basis for both normal route endpoints (always snapped
 * to the network, like any turn-by-turn router does) and the spec §16
 * off-network fallback (the snap distance tells the caller how far off the
 * network the requested point actually was).
 *
 * Linear scan over all edges — fine for a regional extract, but the first
 * thing to replace with a spatial index (grid or R-tree) if this is ever
 * run against a full county-wide graph. See docs/DATA.md.
 */
export function snapToGraph(graph: RoutingGraph, point: [number, number]): GraphSnap | null {
  let best: GraphSnap | null = null;

  for (const edge of graph.edges) {
    const projection = nearestPointOnSegment(point, edge.aCoord, edge.bCoord);
    if (best && projection.distanceMeters >= best.distanceMeters) continue;

    const exactNodeId =
      projection.t <= 1e-9 ? edge.a : projection.t >= 1 - 1e-9 ? edge.b : null;

    best = {
      point: projection.point,
      distanceMeters: projection.distanceMeters,
      edge,
      exactNodeId,
    };
  }

  return best;
}
