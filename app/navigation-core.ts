export type NavPoint = { lat: number; lng: number };

export const GUIDANCE_THRESHOLDS = [300, 100, 50] as const;
export const OFF_ROUTE_THRESHOLD_METERS = 70;
export const OFF_ROUTE_CONFIRMATIONS = 2;
export const REROUTE_COOLDOWN_MS = 15000;

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceMeters(a: NavPoint, b: NavPoint) {
  const R = 6371e3;
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dp = toRad(b.lat - a.lat);
  const dl = toRad(b.lng - a.lng);
  const x =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function projectMeters(point: NavPoint, origin: NavPoint) {
  const latScale = 111_320;
  const lngScale = Math.cos(toRad(origin.lat)) * 111_320;
  return {
    x: (point.lng - origin.lng) * lngScale,
    y: (point.lat - origin.lat) * latScale,
  };
}

function distanceToSegmentMeters(point: NavPoint, a: NavPoint, b: NavPoint) {
  const p = projectMeters(point, a);
  const end = projectMeters(b, a);
  const len2 = end.x * end.x + end.y * end.y;
  if (len2 <= 0.0001) return Math.hypot(p.x, p.y);
  const t = Math.max(0, Math.min(1, (p.x * end.x + p.y * end.y) / len2));
  const dx = p.x - end.x * t;
  const dy = p.y - end.y * t;
  return Math.hypot(dx, dy);
}

export function distanceToRouteMeters(position: NavPoint, coordinates: number[][]) {
  if (coordinates.length === 0) return Infinity;
  if (coordinates.length === 1) {
    return distanceMeters(position, { lng: coordinates[0][0], lat: coordinates[0][1] });
  }

  let best = Infinity;
  for (let i = 1; i < coordinates.length; i += 1) {
    const a = { lng: coordinates[i - 1][0], lat: coordinates[i - 1][1] };
    const b = { lng: coordinates[i][0], lat: coordinates[i][1] };
    const d = distanceToSegmentMeters(position, a, b);
    if (d < best) best = d;
  }
  return best;
}

export function guidanceThresholdForDistance(meters: number) {
  if (meters <= 50) return 50;
  if (meters <= 100) return 100;
  if (meters <= 300) return 300;
  return null;
}

export function greekDistancePhrase(meters: number) {
  if (meters >= 1000) {
    const km = Math.max(1, Math.round(meters / 100) / 10);
    return `σε ${String(km).replace('.', ',')} χιλιόμετρα`;
  }
  return `σε ${Math.max(10, Math.round(meters / 10) * 10)} μέτρα`;
}
