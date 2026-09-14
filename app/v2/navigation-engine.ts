import { distanceMeters, distanceToRouteMeters, guidanceThresholdForDistance, OFF_ROUTE_CONFIRMATIONS, OFF_ROUTE_THRESHOLD_METERS, REROUTE_COOLDOWN_MS } from '../navigation-core';
import { laneGuidanceForStep, type LaneGuidance } from './lane-guidance';
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
  offRouteDistanceMeters: number;
  remainingDistanceMeters: number;
  remainingDurationSeconds: number;
  progress: number;
  laneGuidance: LaneGuidance | null;
};

export function createNavigationSnapshot(route: RouteResult): NavigationSnapshot {
  return { active: true, route, stepIndex: 0, offRouteConfirmations: 0, lastRerouteAt: 0, arrived: false };
}

function stepPoint(step: RouteStep | undefined): GeoPoint | null {
  return step?.point ?? null;
}

function remainingMetrics(route: RouteResult, stepIndex: number) {
  const remainingSteps = route.steps.slice(Math.max(0, stepIndex));
  const remainingDistanceMeters = remainingSteps.reduce((sum, step) => sum + Math.max(0, step.distanceMeters), 0);
  const remainingDurationSeconds = remainingSteps.reduce((sum, step) => sum + Math.max(0, step.durationSeconds), 0);
  const distanceBase = route.distanceMeters > 0 ? route.distanceMeters : remainingDistanceMeters;
  const progress = distanceBase > 0 ? Math.max(0, Math.min(1, 1 - remainingDistanceMeters / distanceBase)) : 0;
  return { remainingDistanceMeters, remainingDurationSeconds, progress };
}

export function updateNavigation(snapshot: NavigationSnapshot, position: GeoPoint, now = Date.now()): NavigationUpdate {
  const route = snapshot.route;
  if (!snapshot.active || !route) {
    return {
      ...snapshot,
      distanceToManeuver: null,
      guidanceThreshold: null,
      shouldReroute: false,
      offRouteDistanceMeters: 0,
      remainingDistanceMeters: 0,
      remainingDurationSeconds: 0,
      progress: snapshot.arrived ? 1 : 0,
      laneGuidance: null,
    };
  }

  const destination = route.geometry[route.geometry.length - 1];
  const arrived = destination ? distanceMeters(position, destination) < 30 : false;
  const current = stepPoint(route.steps[snapshot.stepIndex]);
  const distanceToManeuver = current ? distanceMeters(position, current) : null;
  let stepIndex = snapshot.stepIndex;
  if (distanceToManeuver != null && distanceToManeuver < 35 && stepIndex < route.steps.length - 1) stepIndex += 1;

  const routeCoordinates = route.geometry.map((point: GeoPoint) => [point.lng, point.lat]);
  const offRouteDistanceMeters = distanceToRouteMeters(position, routeCoordinates);
  const offRouteConfirmations = offRouteDistanceMeters > OFF_ROUTE_THRESHOLD_METERS ? snapshot.offRouteConfirmations + 1 : 0;
  const cooldownElapsed = now - snapshot.lastRerouteAt >= REROUTE_COOLDOWN_MS;
  const shouldReroute = offRouteConfirmations >= OFF_ROUTE_CONFIRMATIONS && cooldownElapsed;
  const metrics = remainingMetrics(route, stepIndex);

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
    offRouteDistanceMeters,
    remainingDistanceMeters: arrived ? 0 : metrics.remainingDistanceMeters,
    remainingDurationSeconds: arrived ? 0 : metrics.remainingDurationSeconds,
    progress: arrived ? 1 : metrics.progress,
    laneGuidance: laneGuidanceForStep(route.steps[stepIndex]),
  };
}
