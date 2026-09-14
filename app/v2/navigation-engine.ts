import { distanceMeters, distanceToRouteMeters, guidanceThresholdForDistance, OFF_ROUTE_CONFIRMATIONS, OFF_ROUTE_THRESHOLD_METERS, REROUTE_COOLDOWN_MS } from '../navigation-core';
import type { GeoPoint, RouteResult, RouteStep } from './types';

export type NavigationSnapshot = {
  active: boolean;
  route: RouteResult | null;
  stepIndex: number;
  offRouteConfirmations: number;
  lastRerouteAt: number;
  arrived: boolean;
};

export type NavigationUpdate = NavigationSnapshot & {
  distanceToManeuver: number | null;
  guidanceThreshold: number | null;
  shouldReroute: boolean;
};

export function createNavigationSnapshot(route: RouteResult): NavigationSnapshot {
  return { active: true, route, stepIndex: 0, offRouteConfirmations: 0, lastRerouteAt: 0, arrived: false };
}

function stepPoint(step: RouteStep | undefined): GeoPoint | null {
  return step?.point ?? null;
}

export function updateNavigation(snapshot: NavigationSnapshot, position: GeoPoint, now = Date.now()): NavigationUpdate {
  const route = snapshot.route;
  if (!snapshot.active || !route) return { ...snapshot, distanceToManeuver: null, guidanceThreshold: null, shouldReroute: false };

  const destination = route.points[route.points.length - 1];
  const arrived = destination ? distanceMeters(position, destination) < 30 : false;
  const current = stepPoint(route.steps[snapshot.stepIndex]);
  const distanceToManeuver = current ? distanceMeters(position, current) : null;
  let stepIndex = snapshot.stepIndex;
  if (distanceToManeuver != null && distanceToManeuver < 35 && stepIndex < route.steps.length - 1) stepIndex += 1;

  const routeCoordinates = route.points.map((point) => [point.lng, point.lat]);
  const offRouteDistance = distanceToRouteMeters(position, routeCoordinates);
  const offRouteConfirmations = offRouteDistance > OFF_ROUTE_THRESHOLD_METERS ? snapshot.offRouteConfirmations + 1 : 0;
  const cooldownElapsed = now - snapshot.lastRerouteAt >= REROUTE_COOLDOWN_MS;
  const shouldReroute = offRouteConfirmations >= OFF_ROUTE_CONFIRMATIONS && cooldownElapsed;

  return {
    ...snapshot,
    stepIndex,
    offRouteConfirmations: shouldReroute ? 0 : offRouteConfirmations,
    lastRerouteAt: shouldReroute ? now : snapshot.lastRerouteAt,
    arrived,
    active: arrived ? false : snapshot.active,
    distanceToManeuver,
    guidanceThreshold: distanceToManeuver == null ? null : guidanceThresholdForDistance(distanceToManeuver),
    shouldReroute,
  };
}
