import type {
  BoundingBox,
  OfflineRegion,
  ProviderAvailability,
  RouteRequest,
  RouteResult,
  SearchResult,
} from './types';

export type SearchOptions = {
  limit?: number;
  near?: { lat: number; lng: number };
  offlineOnly?: boolean;
};

export type OfflineRegionCreateRequest = {
  name: string;
  bounds: BoundingBox;
  minZoom: number;
  maxZoom: number;
};

export interface MapProvider {
  readonly id: string;
  availability(): Promise<ProviderAvailability>;
  setNetworkEnabled?(enabled: boolean): Promise<void>;
}

export interface SearchProvider {
  readonly id: string;
  availability(): Promise<ProviderAvailability>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

export interface RoutingProvider {
  readonly id: string;
  availability(): Promise<ProviderAvailability>;
  route(request: RouteRequest): Promise<RouteResult>;
}

export interface OfflineRegionProvider {
  readonly id: string;
  availability(): Promise<ProviderAvailability>;
  list(): Promise<OfflineRegion[]>;
  create(request: OfflineRegionCreateRequest): Promise<OfflineRegion>;
  remove(regionId: string): Promise<void>;
}

export interface VoiceProvider {
  readonly id: string;
  availability(): Promise<ProviderAvailability>;
  speak(text: string, language?: string): Promise<void>;
  stop(): Promise<void>;
}

export interface TrafficProvider {
  readonly id: string;
  availability(): Promise<ProviderAvailability>;
  routeAdjustmentSeconds(route: RouteResult): Promise<number | null>;
}
