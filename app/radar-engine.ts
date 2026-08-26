export type GeoPoint = { lat: number; lng: number };

export type RadarKind = 'fixed_camera' | 'mobile_radar' | 'police';
export type RadarSource = 'osm' | 'community' | 'local';

export type RadarAlert = {
  id: string;
  point: GeoPoint;
  kind: RadarKind;
  source: RadarSource;
  reportedAt?: number;
  expiresAt?: number;
  confirmations?: number;
  dismissals?: number;
  label?: string;
};

export type RadarCandidate = RadarAlert & {
  distanceMeters: number;
  bearingDifference: number;
  confidence: number;
};

const EARTH_RADIUS_M = 6371000;

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function toDeg(value: number) {
  return (value * 180) / Math.PI;
}

export function distanceMeters(a: GeoPoint, b: GeoPoint) {
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dp = toRad(b.lat - a.lat);
  const dl = toRad(b.lng - a.lng);
  const h =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function bearingDegrees(from: GeoPoint, to: GeoPoint) {
  const p1 = toRad(from.lat);
  const p2 = toRad(to.lat);
  const dl = toRad(to.lng - from.lng);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function angleDifference(a: number, b: number) {
  const diff = Math.abs(((a - b + 540) % 360) - 180);
  return diff;
}

export function communityConfidence(alert: RadarAlert, now = Date.now()) {
  if (alert.expiresAt && alert.expiresAt <= now) return 0;
  if (alert.source === 'osm' || alert.kind === 'fixed_camera') return 1;

  const confirmations = Math.max(0, alert.confirmations ?? 0);
  const dismissals = Math.max(0, alert.dismissals ?? 0);
  const totalVotes = confirmations + dismissals;
  const voteScore = totalVotes ? confirmations / totalVotes : 0.55;

  if (!alert.reportedAt) return voteScore;
  const ageMinutes = Math.max(0, (now - alert.reportedAt) / 60000);
  const freshness = Math.max(0.15, 1 - ageMinutes / 180);
  return Math.max(0, Math.min(1, voteScore * freshness));
}

export function getRadarCandidates(params: {
  position: GeoPoint;
  heading: number | null;
  alerts: RadarAlert[];
  maxDistanceMeters?: number;
  maxBearingDifference?: number;
  minConfidence?: number;
  now?: number;
}) {
  const {
    position,
    heading,
    alerts,
    maxDistanceMeters = 1500,
    maxBearingDifference = 65,
    minConfidence = 0.25,
    now = Date.now(),
  } = params;

  return alerts
    .map((alert): RadarCandidate | null => {
      const distance = distanceMeters(position, alert.point);
      if (distance > maxDistanceMeters) return null;

      const bearing = bearingDegrees(position, alert.point);
      const bearingDiff = heading == null ? 0 : angleDifference(heading, bearing);
      if (heading != null && bearingDiff > maxBearingDifference) return null;

      const confidence = communityConfidence(alert, now);
      if (confidence < minConfidence) return null;

      return {
        ...alert,
        distanceMeters: distance,
        bearingDifference: bearingDiff,
        confidence,
      };
    })
    .filter((item): item is RadarCandidate => item !== null)
    .sort((a, b) => a.distanceMeters - b.distanceMeters || b.confidence - a.confidence);
}

export function alertThreshold(distance: number) {
  if (distance <= 150) return 150;
  if (distance <= 500) return 500;
  if (distance <= 1000) return 1000;
  return null;
}

export function radarVoiceText(alert: RadarAlert, threshold: 1000 | 500 | 150) {
  const type =
    alert.kind === 'fixed_camera'
      ? 'σταθερή κάμερα ταχύτητας'
      : alert.kind === 'mobile_radar'
        ? 'αναφερόμενο κινητό ραντάρ'
        : 'αναφερόμενος αστυνομικός έλεγχος';
  return `Προσοχή. ${type} σε ${threshold} μέτρα.`;
}

export function createCommunityReport(params: {
  point: GeoPoint;
  kind: Exclude<RadarKind, 'fixed_camera'>;
  now?: number;
  ttlMinutes?: number;
}) : RadarAlert {
  const now = params.now ?? Date.now();
  const ttlMinutes = params.ttlMinutes ?? (params.kind === 'mobile_radar' ? 90 : 60);
  return {
    id: `community-${params.kind}-${Math.round(params.point.lat * 1e5)}-${Math.round(params.point.lng * 1e5)}-${now}`,
    point: params.point,
    kind: params.kind,
    source: 'local',
    reportedAt: now,
    expiresAt: now + ttlMinutes * 60000,
    confirmations: 1,
    dismissals: 0,
  };
}

export async function fetchOsmFixedCameras(position: GeoPoint, radiusMeters = 12000): Promise<RadarAlert[]> {
  const query = `[out:json][timeout:12];(node[\"highway\"=\"speed_camera\"](around:${Math.round(radiusMeters)},${position.lat},${position.lng});node[\"enforcement\"=\"maxspeed\"](around:${Math.round(radiusMeters)},${position.lat},${position.lng}););out body;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
  const data: any = await response.json();
  return (data?.elements ?? [])
    .filter((item: any) => Number.isFinite(item?.lat) && Number.isFinite(item?.lon))
    .map((item: any): RadarAlert => ({
      id: `osm-${item.id}`,
      point: { lat: Number(item.lat), lng: Number(item.lon) },
      kind: 'fixed_camera',
      source: 'osm',
      label: String(item?.tags?.name || item?.tags?.ref || 'Speed camera'),
    }));
}

export async function fetchCommunityAlerts(params: {
  baseUrl?: string;
  position: GeoPoint;
  radiusMeters?: number;
}): Promise<RadarAlert[]> {
  const baseUrl = params.baseUrl?.trim();
  if (!baseUrl) return [];
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/radar/nearby`);
  url.searchParams.set('lat', String(params.position.lat));
  url.searchParams.set('lng', String(params.position.lng));
  url.searchParams.set('radius', String(params.radiusMeters ?? 12000));
  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Community radar HTTP ${response.status}`);
  const payload: any = await response.json();
  return Array.isArray(payload) ? payload : Array.isArray(payload?.alerts) ? payload.alerts : [];
}
