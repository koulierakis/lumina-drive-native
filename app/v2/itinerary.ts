import type { RoutingProvider, TrafficProvider } from './providers';
import { routeOfflineFirst } from './provider-policy';
import type { EtaEstimate, Itinerary, RouteRequest, RouteResult } from './types';

export function itineraryToRouteRequest(itinerary: Itinerary): RouteRequest {
  if (itinerary.stops.length === 0) throw new Error('Itinerary requires at least one stop');
  const destination = itinerary.stops[itinerary.stops.length - 1].point;
  const waypoints = itinerary.stops.slice(0, -1).map((stop) => stop.point);
  return {
    origin: itinerary.origin,
    destination,
    waypoints,
    profile: itinerary.profile,
    preference: itinerary.preference,
    avoidTolls: itinerary.avoidTolls,
    avoidFerries: itinerary.avoidFerries,
    avoidHighways: itinerary.avoidHighways,
  };
}

export async function routeItinerary(itinerary: Itinerary, providers: RoutingProvider[]): Promise<RouteResult> {
  return routeOfflineFirst(itineraryToRouteRequest(itinerary), providers);
}

export async function estimateEta(
  route: RouteResult,
  trafficProviders: TrafficProvider[],
  now = Date.now(),
): Promise<EtaEstimate> {
  let trafficAdjustmentSeconds = 0;
  for (const provider of trafficProviders) {
    try {
      const status = await provider.availability();
      if (!status.available) continue;
      const adjustment = await provider.routeAdjustmentSeconds(route);
      if (typeof adjustment === 'number' && Number.isFinite(adjustment)) {
        trafficAdjustmentSeconds = Math.max(0, Math.round(adjustment));
        break;
      }
    } catch {
      // Traffic is optional. Navigation must remain available without it.
    }
  }
  const baseDurationSeconds = Math.max(0, Math.round(route.durationSeconds));
  const totalDurationSeconds = baseDurationSeconds + trafficAdjustmentSeconds;
  return {
    baseDurationSeconds,
    trafficAdjustmentSeconds,
    totalDurationSeconds,
    arrivalTimeMs: now + totalDurationSeconds * 1000,
  };
}
