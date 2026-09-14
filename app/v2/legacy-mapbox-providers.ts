import type { RoutingProvider, SearchOptions, SearchProvider } from './providers';
import type { ProviderAvailability, RouteRequest, RouteResult, SearchResult } from './types';

const SEARCH_API = 'https://api.mapbox.com/search/searchbox/v1/forward';
const DIRECTIONS_API = 'https://api.mapbox.com/directions/v5/mapbox';

type TokenSource = () => string | null | undefined;

function availabilityForToken(token: string | null | undefined): ProviderAvailability {
  return {
    available: Boolean(token?.startsWith('pk.')),
    offlineCapable: false,
    reason: token?.startsWith('pk.') ? undefined : 'Mapbox token unavailable',
  };
}

export class LegacyMapboxSearchProvider implements SearchProvider {
  readonly id = 'mapbox-legacy-search';

  constructor(private readonly tokenSource: TokenSource) {}

  async availability(): Promise<ProviderAvailability> {
    return availabilityForToken(this.tokenSource());
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const token = this.tokenSource();
    const status = availabilityForToken(token);
    if (!status.available || !token) throw new Error(status.reason);

    const url = new URL(SEARCH_API);
    url.searchParams.set('q', query.trim());
    url.searchParams.set('access_token', token);
    url.searchParams.set('country', 'GR');
    url.searchParams.set('language', 'el');
    url.searchParams.set('limit', String(Math.max(1, Math.min(options.limit ?? 10, 25))));
    url.searchParams.set('types', 'poi');
    if (options.near) url.searchParams.set('proximity', `${options.near.lng},${options.near.lat}`);

    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : {};
    if (!response.ok) throw new Error(`Mapbox HTTP ${response.status}: ${data?.message || raw || 'error'}`);

    return (data.features || []).flatMap((feature: any, index: number) => {
      const coords = feature?.geometry?.coordinates;
      const properties = feature?.properties || {};
      if (!Array.isArray(coords) || coords.length < 2 || !properties.name) return [];
      const lat = Number(coords[1]);
      const lng = Number(coords[0]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      return [{
        id: String(feature.id || `${properties.name}-${index}`),
        name: String(properties.name),
        point: { lat, lng },
        address: String(properties.full_address || properties.place_formatted || properties.address || '—'),
        category: String(properties.poi_category?.[0] || properties.maki || query),
        source: this.id,
      } satisfies SearchResult];
    });
  }
}

export class LegacyMapboxRoutingProvider implements RoutingProvider {
  readonly id = 'mapbox-legacy-routing';

  constructor(private readonly tokenSource: TokenSource) {}

  async availability(): Promise<ProviderAvailability> {
    return availabilityForToken(this.tokenSource());
  }

  async route(request: RouteRequest): Promise<RouteResult> {
    const token = this.tokenSource();
    const status = availabilityForToken(token);
    if (!status.available || !token) throw new Error(status.reason);

    const profile = request.profile === 'walking' ? 'walking' : request.profile === 'cycling' ? 'cycling' : 'driving';
    const points = [request.origin, ...(request.waypoints ?? []), request.destination];
    const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(';');
    const url = new URL(`${DIRECTIONS_API}/${profile}/${coordinates}`);
    url.searchParams.set('access_token', token);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');
    url.searchParams.set('steps', 'true');
    url.searchParams.set('language', 'el');

    const excludes = [
      request.avoidTolls ? 'toll' : null,
      request.avoidFerries ? 'ferry' : null,
      request.avoidHighways ? 'motorway' : null,
    ].filter(Boolean);
    if (excludes.length) url.searchParams.set('exclude', excludes.join(','));

    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : {};
    if (!response.ok) throw new Error(`Directions HTTP ${response.status}: ${data?.message || raw || 'error'}`);

    const first = data?.routes?.[0];
    const coordinatesOut = first?.geometry?.coordinates;
    if (!first || !Array.isArray(coordinatesOut) || coordinatesOut.length < 2) {
      throw new Error('No route returned');
    }

    return {
      id: String(first.weight_name || `${Date.now()}`),
      geometry: coordinatesOut.map((coordinate: number[]) => ({ lng: Number(coordinate[0]), lat: Number(coordinate[1]) })),
      distanceMeters: Number(first.distance || 0),
      durationSeconds: Number(first.duration || 0),
      steps: (first?.legs || []).flatMap((leg: any) => (leg?.steps || []).flatMap((step: any) => {
        const location = step?.maneuver?.location;
        if (!Array.isArray(location) || location.length < 2) return [];
        return [{
          instruction: String(step?.maneuver?.instruction || 'Συνέχισε στη διαδρομή'),
          point: { lng: Number(location[0]), lat: Number(location[1]) },
          distanceMeters: Number(step?.distance || 0),
          durationSeconds: Number(step?.duration || 0),
          maneuver: String(step?.maneuver?.type || ''),
        }];
      })),
      source: this.id,
    };
  }
}
