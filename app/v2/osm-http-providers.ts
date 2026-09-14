import type { RoutingProvider, SearchOptions, SearchProvider } from './providers';
import type { ProviderAvailability, RouteRequest, RouteResult, SearchResult } from './types';

export type HttpProviderConfig = {
  baseUrl: string;
  headers?: Record<string, string>;
};

function cleanBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export class NominatimSearchProvider implements SearchProvider {
  readonly id = 'nominatim-search';
  private readonly baseUrl: string;

  constructor(private readonly config: HttpProviderConfig) {
    this.baseUrl = cleanBaseUrl(config.baseUrl);
  }

  async availability(): Promise<ProviderAvailability> {
    return {
      available: this.baseUrl.startsWith('http://') || this.baseUrl.startsWith('https://'),
      offlineCapable: false,
      reason: this.baseUrl ? undefined : 'Nominatim endpoint unavailable',
    };
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (options.offlineOnly) return [];
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('q', query.trim());
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', String(Math.max(1, Math.min(options.limit ?? 10, 25))));
    if (options.near) {
      const delta = 0.5;
      url.searchParams.set('viewbox', `${options.near.lng - delta},${options.near.lat + delta},${options.near.lng + delta},${options.near.lat - delta}`);
      url.searchParams.set('bounded', '0');
    }

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json', ...(this.config.headers ?? {}) },
    });
    if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data.flatMap((item: any, index: number) => {
      const lat = Number(item?.lat);
      const lng = Number(item?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      return [{
        id: String(item?.place_id ?? `${lat}-${lng}-${index}`),
        name: String(item?.name || item?.display_name?.split(',')?.[0] || query),
        point: { lat, lng },
        address: String(item?.display_name || ''),
        category: String(item?.type || item?.category || ''),
        source: this.id,
      } satisfies SearchResult];
    });
  }
}

function profileName(request: RouteRequest): string {
  if (request.profile === 'walking') return 'foot';
  if (request.profile === 'cycling') return 'bike';
  return 'car';
}

export class OsrmRoutingProvider implements RoutingProvider {
  readonly id = 'osrm-routing';
  private readonly baseUrl: string;

  constructor(private readonly config: HttpProviderConfig) {
    this.baseUrl = cleanBaseUrl(config.baseUrl);
  }

  async availability(): Promise<ProviderAvailability> {
    return {
      available: this.baseUrl.startsWith('http://') || this.baseUrl.startsWith('https://'),
      offlineCapable: false,
      reason: this.baseUrl ? undefined : 'OSRM endpoint unavailable',
    };
  }

  async route(request: RouteRequest): Promise<RouteResult> {
    const points = [request.origin, ...(request.waypoints ?? []), request.destination];
    const coords = points.map((point) => `${point.lng},${point.lat}`).join(';');
    const url = new URL(`${this.baseUrl}/route/v1/${profileName(request)}/${coords}`);
    url.searchParams.set('overview', 'full');
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('steps', 'true');
    url.searchParams.set('alternatives', 'false');

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json', ...(this.config.headers ?? {}) },
    });
    if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);
    const data = await response.json();
    const first = data?.routes?.[0];
    const coordinates = first?.geometry?.coordinates;
    if (!first || !Array.isArray(coordinates) || coordinates.length < 2) throw new Error('No OSRM route returned');

    return {
      id: String(first?.weight_name || `osrm-${Date.now()}`),
      geometry: coordinates.map((coordinate: number[]) => ({ lng: Number(coordinate[0]), lat: Number(coordinate[1]) })),
      distanceMeters: Number(first.distance || 0),
      durationSeconds: Number(first.duration || 0),
      steps: (first?.legs || []).flatMap((leg: any) => (leg?.steps || []).map((step: any) => {
        const location = step?.maneuver?.location;
        return {
          instruction: String(step?.name ? `${step?.maneuver?.type || 'continue'} ${step.name}` : step?.maneuver?.type || 'continue'),
          point: Array.isArray(location) && location.length >= 2 ? { lng: Number(location[0]), lat: Number(location[1]) } : undefined,
          distanceMeters: Number(step?.distance || 0),
          durationSeconds: Number(step?.duration || 0),
          maneuver: String(step?.maneuver?.type || ''),
        };
      })),
      source: this.id,
    };
  }
}
