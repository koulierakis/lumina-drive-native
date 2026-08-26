import {
  OFF_ROUTE_CONFIRMATIONS,
  OFF_ROUTE_THRESHOLD_METERS,
  REROUTE_COOLDOWN_MS,
  distanceToRouteMeters,
  type NavPoint,
} from './navigation-core';

export type RerouteState = {
  offRouteSamples: number;
  lastRerouteAt: number;
  isRerouting: boolean;
};

export type RerouteDecision = {
  shouldReroute: boolean;
  routeDistanceMeters: number;
  nextState: RerouteState;
};

export const initialRerouteState: RerouteState = {
  offRouteSamples: 0,
  lastRerouteAt: 0,
  isRerouting: false,
};

export function evaluateReroute(
  position: NavPoint,
  routeCoordinates: number[][],
  state: RerouteState,
  now = Date.now(),
): RerouteDecision {
  const routeDistanceMeters = distanceToRouteMeters(position, routeCoordinates);

  if (!Number.isFinite(routeDistanceMeters)) {
    return {
      shouldReroute: false,
      routeDistanceMeters,
      nextState: { ...state, offRouteSamples: 0 },
    };
  }

  if (routeDistanceMeters <= OFF_ROUTE_THRESHOLD_METERS) {
    return {
      shouldReroute: false,
      routeDistanceMeters,
      nextState: { ...state, offRouteSamples: 0 },
    };
  }

  const offRouteSamples = state.offRouteSamples + 1;
  const cooldownElapsed = now - state.lastRerouteAt >= REROUTE_COOLDOWN_MS;
  const confirmed = offRouteSamples >= OFF_ROUTE_CONFIRMATIONS;
  const shouldReroute = confirmed && cooldownElapsed && !state.isRerouting;

  return {
    shouldReroute,
    routeDistanceMeters,
    nextState: {
      ...state,
      offRouteSamples: shouldReroute ? 0 : offRouteSamples,
      lastRerouteAt: shouldReroute ? now : state.lastRerouteAt,
      isRerouting: shouldReroute ? true : state.isRerouting,
    },
  };
}

export function markRerouteFinished(state: RerouteState): RerouteState {
  return {
    ...state,
    offRouteSamples: 0,
    isRerouting: false,
  };
}
