import type { RoutingProvider } from './providers';
import type { GeoPoint, ProviderAvailability, RouteRequest, RouteResult, RouteStep } from './types';

export interface ValhallaNativeBridge {
  isReady(): Promise<boolean>;
  routeRaw(requestJson: string): Promise<string>;
}

type ValhallaManeuver = {
  instruction?: string;
  verbal_pre_transition_instruction?: string;
  length?: number;
  time?: number;
  type?: number;
  begin_shape_index?: number;
};

type ValhallaLeg = {
  shape?: string;
  maneuvers?: ValhallaManeuver[];
  summary?: { length?: number; time?: number };
};

type ValhallaRouteResponse = {
  trip?: {
    status?: number;
    status_message?: string;
    summary?: { length?: number; time?: number };
    legs?: ValhallaLeg[];
  };
};

function costingFor(request: RouteRequest) {
  if (request.profile === 'walking') return 'pedestrian';
  if (request.profile === 'cycling') return 'bicycle';
  return 'auto';
}

function decodePolyline6(encoded: string): GeoPoint[] {
  const points: GeoPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e6, lng: lng / 1e6 });
  }

  return points;
}

function encodeRequest(request: RouteRequest) {
  const points = [request.origin, ...(request.waypoints ?? []), request.destination];
  return JSON.stringify({
    locations: points.map((point, index) => ({
      lat: point.lat,
      lon: point.lng,
      type: index === 0 || index === points.length - 1 ? 'break' : 'through',
    })),
    costing: costingFor(request),
    units: 'kilometers',
    language: 'el-GR',
    directions_options: {
      units: 'kilometers',
      language: 'el-GR',
    },
  });
}

function parseLeg(leg: ValhallaLeg, geometryOffset: number) {
  const geometry = leg.shape ? decodePolyline6(leg.shape) : [];
  const steps: RouteStep[] = (leg.maneuvers ?? []).map((maneuver) => {
    const localIndex = Math.max(0, Number(maneuver.begin_shape_index ?? 0));
    return {
      instruction: String(
        maneuver.instruction
        || maneuver.verbal_pre_transition_instruction
        || 'Συνέχισε στη διαδρομή',
      ),
      distanceMeters: Math.max(0, Number(maneuver.length ?? 0) * 1000),
      durationSeconds: Math.max(0, Number(maneuver.time ?? 0)),
      maneuver: maneuver.type == null ? undefined : `valhalla:${maneuver.type}`,
      point: geometry[localIndex],
    };
  });

  return { geometry, steps, geometryOffset };
}

export class ValhallaOfflineRoutingProvider implements RoutingProvider {
  readonly id = 'valhalla-offline';

  constructor(private readonly bridge: ValhallaNativeBridge) {}

  async availability(): Promise<ProviderAvailability> {
    try {
      const ready = await this.bridge.isReady();
      return {
        available: ready,
        offlineCapable: true,
        reason: ready ? undefined : 'No verified Valhalla routing package is active',
      };
    } catch (error) {
      return {
        available: false,
        offlineCapable: true,
        reason: error instanceof Error ? error.message : 'Valhalla bridge unavailable',
      };
    }
  }

  async route(request: RouteRequest): Promise<RouteResult> {
    const status = await this.availability();
    if (!status.available) throw new Error(status.reason ?? 'Valhalla unavailable');

    const raw = await this.bridge.routeRaw(encodeRequest(request));
    const response = JSON.parse(raw) as ValhallaRouteResponse;
    const trip = response.trip;
    if (!trip || (trip.status != null && trip.status !== 0)) {
      throw new Error(trip?.status_message || 'Valhalla returned no route');
    }

    const geometry: GeoPoint[] = [];
    const steps: RouteStep[] = [];
    for (const leg of trip.legs ?? []) {
      const parsed = parseLeg(leg, geometry.length);
      if (geometry.length && parsed.geometry.length) parsed.geometry.shift();
      geometry.push(...parsed.geometry);
      steps.push(...parsed.steps);
    }

    if (geometry.length < 2) throw new Error('Valhalla route geometry is empty');

    const legDistanceMeters = (trip.legs ?? []).reduce(
      (sum, leg) => sum + Math.max(0, Number(leg.summary?.length ?? 0) * 1000),
      0,
    );
    const legDurationSeconds = (trip.legs ?? []).reduce(
      (sum, leg) => sum + Math.max(0, Number(leg.summary?.time ?? 0)),
      0,
    );

    return {
      id: `valhalla-${Date.now()}`,
      geometry,
      distanceMeters: Math.max(0, Number(trip.summary?.length ?? 0) * 1000) || legDistanceMeters,
      durationSeconds: Math.max(0, Number(trip.summary?.time ?? 0)) || legDurationSeconds,
      steps,
      source: this.id,
    };
  }
}

export const valhallaPolyline6 = { decode: decodePolyline6 };
