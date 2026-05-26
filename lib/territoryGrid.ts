/**
 * Territory Grid
 *
 * Divides the world into ~200m × 200m cells with deterministic IDs.
 * Each cell ID is `${lat_bucket}_${lon_bucket}` so the same patch of land
 * always resolves to the same string anywhere in the world.
 *
 * We do NOT use a true equal-area grid (S2 / H3) because:
 *   1) zero deps, pure JS, runs on-device for live "cells claimed" counters
 *   2) ~200m at the equator is close enough for the game mechanic
 *   3) cells distort toward the poles, but that's fine — nobody runs in Antarctica
 *
 * Cell granularity: 0.0018° lat × 0.0018° lon ≈ 200m × 200m at the equator
 * (1° lat ≈ 111km, so 0.0018° ≈ 200m).
 */

const CELL_SIZE_DEG = 0.0018; // ~200 m

export interface LatLon {
  lat: number;
  lon: number;
}

/** Round a coordinate down to the nearest cell boundary. */
function bucket(coord: number): number {
  return Math.floor(coord / CELL_SIZE_DEG);
}

/** Resolve a single lat/lon to its territory cell ID. */
export function cellIdForPoint(p: LatLon): string {
  return `${bucket(p.lat)}_${bucket(p.lon)}`;
}

/** Return the SW corner lat/lon of a given cell id. */
export function cellCorner(cellId: string): LatLon {
  const [latB, lonB] = cellId.split('_').map(Number);
  return { lat: latB * CELL_SIZE_DEG, lon: lonB * CELL_SIZE_DEG };
}

/**
 * Walk through a track of GPS points and return the set of unique cell IDs
 * touched. We sample at each waypoint and also at intermediate points along
 * segments so we don't skip cells when the user moves quickly.
 */
export function cellsForTrack(track: LatLon[]): Set<string> {
  const cells = new Set<string>();
  if (track.length === 0) return cells;

  cells.add(cellIdForPoint(track[0]));
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    cells.add(cellIdForPoint(b));

    // Interpolate intermediate points along the segment so we don't miss
    // cells if waypoints are widely spaced (e.g. driving briefly during a run).
    const dLat = b.lat - a.lat;
    const dLon = b.lon - a.lon;
    const segLenDeg = Math.sqrt(dLat * dLat + dLon * dLon);
    const subSteps = Math.ceil(segLenDeg / (CELL_SIZE_DEG / 2));
    if (subSteps > 1) {
      for (let s = 1; s < subSteps; s++) {
        const t = s / subSteps;
        cells.add(cellIdForPoint({
          lat: a.lat + dLat * t,
          lon: a.lon + dLon * t,
        }));
      }
    }
  }
  return cells;
}

/**
 * Haversine distance between two lat/lon points in METRES.
 * Used to compute total distance run.
 */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const R = 6371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δφ = toRad(b.lat - a.lat);
  const Δλ = toRad(b.lon - a.lon);
  const x =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Sum metres across an ordered track. */
export function trackDistanceMeters(track: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < track.length; i++) {
    total += distanceMeters(track[i - 1], track[i]);
  }
  return total;
}
