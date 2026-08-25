import { haversineMeters } from './geo';
import type { RoutingGraph } from './graph';

interface HeapItem {
  nodeId: string;
  priority: number;
}

/** Binary min-heap, so pathfinding stays correct-and-fast on a full county-scale graph, not just the sample data. */
class MinHeap {
  private items: HeapItem[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: HeapItem): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): HeapItem | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].priority <= this.items[i].priority) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  private bubbleDown(index: number): void {
    let i = index;
    const n = this.items.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;
      if (left < n && this.items[left].priority < this.items[smallest].priority) smallest = left;
      if (right < n && this.items[right].priority < this.items[smallest].priority) smallest = right;
      if (smallest === i) break;
      [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
      i = smallest;
    }
  }
}

/**
 * A synthetic point along an edge's interior (a route endpoint that didn't
 * land exactly on an existing graph node). Connects directly to that edge's
 * two real endpoints with correctly split distances, without mutating the
 * shared graph — nothing here persists past a single route query.
 */
export interface SyntheticAnchor {
  id: string;
  coordinate: [number, number];
  connections: { to: string; distanceMeters: number }[];
}

/**
 * Builds a neighbor-lookup closure over the static graph plus up to a
 * couple of synthetic anchors, including the reverse links real nodes need
 * to reach those anchors. O(synthetics), not O(graph) — safe to call per
 * query regardless of graph size.
 */
function buildNeighborLookup(
  graph: RoutingGraph,
  synthetics: SyntheticAnchor[],
): {
  neighbors: (nodeId: string) => { to: string; distanceMeters: number }[];
  coordinateOf: (nodeId: string) => [number, number];
} {
  const syntheticById = new Map(synthetics.map((s) => [s.id, s]));
  const reverseAttachments = new Map<string, { to: string; distanceMeters: number }[]>();

  for (const synthetic of synthetics) {
    for (const connection of synthetic.connections) {
      const list = reverseAttachments.get(connection.to);
      const entry = { to: synthetic.id, distanceMeters: connection.distanceMeters };
      if (list) list.push(entry);
      else reverseAttachments.set(connection.to, [entry]);
    }
  }

  return {
    neighbors: (nodeId) => {
      const synthetic = syntheticById.get(nodeId);
      if (synthetic) return synthetic.connections;
      const real = graph.adjacency.get(nodeId) ?? [];
      const extra = reverseAttachments.get(nodeId);
      return extra ? [...real, ...extra] : real;
    },
    coordinateOf: (nodeId) => {
      const synthetic = syntheticById.get(nodeId);
      if (synthetic) return synthetic.coordinate;
      const coord = graph.nodes.get(nodeId);
      if (!coord) throw new Error(`Unknown routing graph node: ${nodeId}`);
      return coord;
    },
  };
}

export interface PathResult {
  /** Ordered node ids, start to goal, including any synthetic anchors. */
  nodeIds: string[];
  coordinates: [number, number][];
  distanceMeters: number;
}

/**
 * A* shortest path between two graph nodes (which may be synthetic
 * mid-edge anchors — see buildNeighborLookup). Returns null when the goal
 * isn't reachable from the start, e.g. the two points snapped to
 * disconnected components of the road network.
 */
export function findPath(
  graph: RoutingGraph,
  startId: string,
  goalId: string,
  synthetics: SyntheticAnchor[] = [],
): PathResult | null {
  const { neighbors, coordinateOf } = buildNeighborLookup(graph, synthetics);
  const goalCoord = coordinateOf(goalId);

  const gScore = new Map<string, number>([[startId, 0]]);
  const cameFrom = new Map<string, string>();
  const visited = new Set<string>();

  const heap = new MinHeap();
  heap.push({ nodeId: startId, priority: haversineMeters(coordinateOf(startId), goalCoord) });

  while (heap.size > 0) {
    const current = heap.pop();
    if (!current) break;
    if (visited.has(current.nodeId)) continue;

    if (current.nodeId === goalId) {
      const nodeIds: string[] = [goalId];
      let node = goalId;
      while (cameFrom.has(node)) {
        node = cameFrom.get(node)!;
        nodeIds.unshift(node);
      }
      return {
        nodeIds,
        coordinates: nodeIds.map(coordinateOf),
        distanceMeters: gScore.get(goalId)!,
      };
    }

    visited.add(current.nodeId);

    for (const edge of neighbors(current.nodeId)) {
      if (visited.has(edge.to)) continue;
      const tentativeG = gScore.get(current.nodeId)! + edge.distanceMeters;
      if (tentativeG < (gScore.get(edge.to) ?? Infinity)) {
        gScore.set(edge.to, tentativeG);
        cameFrom.set(edge.to, current.nodeId);
        const h = haversineMeters(coordinateOf(edge.to), goalCoord);
        heap.push({ nodeId: edge.to, priority: tentativeG + h });
      }
    }
  }

  return null;
}
