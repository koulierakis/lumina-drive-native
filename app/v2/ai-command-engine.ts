import type { DriverIntent } from './ai-intents';
import type { Itinerary, NavigationStop, RoutePreference } from './types';

export type DriverCommandAction =
  | { type: 'navigate_home' }
  | { type: 'search'; query: string }
  | { type: 'reroute'; itinerary: Itinerary }
  | { type: 'add_stop_search'; query: string }
  | { type: 'remove_next_stop'; itinerary: Itinerary }
  | { type: 'cancel_navigation' }
  | { type: 'unhandled'; text: string };

function withPreference(itinerary: Itinerary, preference: RoutePreference): Itinerary {
  return { ...itinerary, preference };
}

export function applyResolvedStop(itinerary: Itinerary, stop: NavigationStop): Itinerary {
  return { ...itinerary, stops: [...itinerary.stops, stop] };
}

export function planDriverCommand(intent: DriverIntent, itinerary?: Itinerary): DriverCommandAction {
  if (intent.type === 'navigate_home') return { type: 'navigate_home' };
  if (intent.type === 'search') return { type: 'search', query: intent.query };
  if (intent.type === 'add_stop') return { type: 'add_stop_search', query: intent.query };
  if (intent.type === 'cancel_navigation') return { type: 'cancel_navigation' };
  if (intent.type === 'unknown') return { type: 'unhandled', text: intent.text };
  if (!itinerary) return { type: 'unhandled', text: 'No active itinerary' };

  if (intent.type === 'remove_next_stop') {
    const stops = itinerary.stops.length > 1 ? itinerary.stops.slice(1) : itinerary.stops;
    return { type: 'remove_next_stop', itinerary: { ...itinerary, stops } };
  }

  switch (intent.option) {
    case 'avoid_tolls': return { type: 'reroute', itinerary: { ...itinerary, avoidTolls: true } };
    case 'allow_tolls': return { type: 'reroute', itinerary: { ...itinerary, avoidTolls: false } };
    case 'avoid_highways': return { type: 'reroute', itinerary: { ...itinerary, avoidHighways: true } };
    case 'allow_highways': return { type: 'reroute', itinerary: { ...itinerary, avoidHighways: false } };
    case 'avoid_ferries': return { type: 'reroute', itinerary: { ...itinerary, avoidFerries: true } };
    case 'allow_ferries': return { type: 'reroute', itinerary: { ...itinerary, avoidFerries: false } };
    case 'fastest': return { type: 'reroute', itinerary: withPreference(itinerary, 'fastest') };
    case 'shortest': return { type: 'reroute', itinerary: withPreference(itinerary, 'shortest') };
  }
}
