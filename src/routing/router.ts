import { bearingDegrees, haversineMeters } from './geo';
import { snapToGraph, type GraphSnap, type RoutingGraph } from './graph';
import { findPath, type SyntheticAnchor } from './pathfinding';

/**
 * How far a requested point can be from the routable network before it
 * counts as "off-network" (spec §16) rather than treated as sitting on a
 * road. 20m comfortably covers normal GPS/tap imprecision on an actual
 * road without also swallowing a real off-network gap.
 */
const OFF_NETWORK_THRESHOLD_METERS = 20;

export interface OffNetworkLeg {
  from: [number, number];
  to: [number, number];
  distanceMeters: number;
  bearingDegrees: number;
}

export interface RouteResult {
  /** Ordered coordinates along the routable network, start to goal. */
  onNetworkCoordinates: [number, number][];
  /** Set only when the start point's gap to the network exceeds the threshold. */
  startOffNetwork: OffNetworkLeg | null;
  /** Set only when the end point's gap to the network exceeds the threshold. */
  endOffNetwork: OffNetworkLeg | null;
  /** Total distance including both endpoints' gaps to the network, whether or not they were large enough to report. */
  totalDistanceMeters: number;
}

export type RouteFailure = 'no-graph-data' | 'no-path-found';

/**
 * Straight-line gap from a requested point to its snapped network location.
 * Always computed, regardless of size — small gaps (GPS/tap imprecision on
 * an actual road) still count toward total distance even when they're not
 * worth reporting to the user as "off-network".
 */
function gapLeg(requestedPoint: [number, number], snapPoint: [number, number]): OffNetworkLeg {
  return {
    from: requestedPoint,
    to: snapPoint,
    distanceMeters: haversineMeters(requestedPoint, snapPoint),
    bearingDegrees: bearingDegrees(snapPoint, requestedPoint),
  };
}

interface Anchor {
  nodeId: string;
  synthetic: SyntheticAnchor | null;
  gap: OffNetworkLeg;
}

function anchorFromSnap(
  snap: GraphSnap,
  requestedPoint: [number, number],
  syntheticId: string,
): Anchor {
  const gap = gapLeg(requestedPoint, snap.point);

  if (snap.exactNodeId) {
    return { nodeId: snap.exactNodeId, synthetic: null, gap };
  }

  return {
    nodeId: syntheticId,
    synthetic: {
      id: syntheticId,
      coordinate: snap.point,
      connections: [
        { to: snap.edge.a, distanceMeters: haversineMeters(snap.point, snap.edge.aCoord) },
        { to: snap.edge.b, distanceMeters: haversineMeters(snap.point, snap.edge.bCoord) },
      ],
    },
    gap,
  };
}

/**
 * Computes a route between two arbitrary points using only the drivable
 * road network (spec §15). Both endpoints are snapped to the nearest point
 * on that network first — standard for any turn-by-turn router — and when
 * a snap distance exceeds the off-network threshold, the corresponding leg
 * is reported separately per spec §16 rather than silently absorbed into
 * the route, so the UI can show it as "off-network" distance/direction.
 */
export function computeRoute(
  graph: RoutingGraph,
  from: [number, number],
  to: [number, number],
): RouteResult | RouteFailure {
  if (graph.edges.length === 0) return 'no-graph-data';

  const startSnap = snapToGraph(graph, from);
  const endSnap = snapToGraph(graph, to);
  if (!startSnap || !endSnap) return 'no-graph-data';

  const start = anchorFromSnap(startSnap, from, 'synthetic:start');
  const end = anchorFromSnap(endSnap, to, 'synthetic:end');

  const synthetics = [start.synthetic, end.synthetic].filter(
    (s): s is SyntheticAnchor => s !== null,
  );

  // If both endpoints land on the same edge, connect them directly so the
  // path doesn't detour via that edge's endpoints — otherwise a valid but
  // needlessly longer route would be reported for this narrow case.
  if (start.synthetic && end.synthetic && startSnap.edge === endSnap.edge) {
    const directDistance = haversineMeters(start.synthetic.coordinate, end.synthetic.coordinate);
    start.synthetic.connections.push({ to: end.synthetic.id, distanceMeters: directDistance });
    end.synthetic.connections.push({ to: start.synthetic.id, distanceMeters: directDistance });
  }

  const path = findPath(graph, start.nodeId, end.nodeId, synthetics);
  if (!path) return 'no-path-found';

  const totalDistanceMeters = path.distanceMeters + start.gap.distanceMeters + end.gap.distanceMeters;

  return {
    onNetworkCoordinates: path.coordinates,
    startOffNetwork: start.gap.distanceMeters > OFF_NETWORK_THRESHOLD_METERS ? start.gap : null,
    endOffNetwork: end.gap.distanceMeters > OFF_NETWORK_THRESHOLD_METERS ? end.gap : null,
    totalDistanceMeters,
  };
}

/** True when either endpoint required a meaningful jump off the routable network. */
export function hasOffNetworkPortion(route: RouteResult): boolean {
  return route.startOffNetwork !== null || route.endOffNetwork !== null;
}

export { OFF_NETWORK_THRESHOLD_METERS };
