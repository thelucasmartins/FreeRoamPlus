import { File, Paths } from 'expo-file-system';

import { USER_DATA_DIR_NAME, WAYPOINTS_FILENAME } from '../config';
import type { Waypoint } from './types';

function waypointsFile(): File {
  return new File(Paths.document, USER_DATA_DIR_NAME, WAYPOINTS_FILENAME);
}

/**
 * Loads saved waypoints (spec §11), or an empty list if none have been
 * saved yet or the file is unreadable — never throws, since a corrupt
 * local file shouldn't block the rest of the app from loading.
 */
export async function loadWaypoints(): Promise<Waypoint[]> {
  try {
    const file = waypointsFile();
    if (!file.exists) return [];
    return (await file.json()) as Waypoint[];
  } catch {
    return [];
  }
}

/**
 * Persists the full waypoint list, overwriting whatever was there before.
 * Unlike loadWaypoints, this one does throw — a failed write (full disk,
 * permissions) needs to reach the caller so it can avoid telling the user
 * their waypoint was saved when it wasn't, rather than being swallowed here.
 */
export function saveWaypoints(waypoints: Waypoint[]): void {
  try {
    const file = waypointsFile();
    if (!file.exists) {
      file.create({ intermediates: true });
    }
    file.write(JSON.stringify(waypoints));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not save waypoints — check available storage. (${reason})`);
  }
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createWaypoint(coordinate: [number, number], note: string): Waypoint {
  return { id: randomId(), coordinate, note: note.trim(), createdAt: Date.now() };
}
