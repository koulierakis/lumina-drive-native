export type GeoPoint = {
  lat: number;
  lng: number;
};

export type BoundingBox = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type FavoritePlace = {
  id: string;
  name: string;
  point: GeoPoint;
  address?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
};

export type OfflineRegionStatus = 'queued' | 'downloading' | 'ready' | 'failed' | 'deleting';

export type OfflineRegion = {
  id: string;
  name: string;
  bounds: BoundingBox;
  minZoom: number;
  maxZoom: number;
  status: OfflineRegionStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
};

export type SearchResult = {
  id: string;
  name: string;
  point: GeoPoint;
  address?: string;
  category?: string;
  source: string;
};

export type RouteProfile = 'driving' | 'walking' | 'cycling';
export type RoutePreference = 'fastest' | 'shortest';

export type RouteRequest = {
  origin: GeoPoint;
  destination: GeoPoint;
  waypoints?: GeoPoint[];
  profile: RouteProfile;
  preference?: RoutePreference;
  avoidTolls?: boolean;
  avoidFerries?: boolean;
  avoidHighways?: boolean;
};

export type Lane = {
  indications: string[];
  valid: boolean;
  active?: boolean;
};

export type RouteStep = {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuver?: string;
  point?: GeoPoint;
  lanes?: Lane[];
};

export type RouteResult = {
  id: string;
  geometry: GeoPoint[];
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
  source: string;
};

export type NavigationStop = {
  id: string;
  name: string;
  point: GeoPoint;
  address?: string;
};

export type Itinerary = {
  origin: GeoPoint;
  stops: NavigationStop[];
  profile: RouteProfile;
  preference?: RoutePreference;
  avoidTolls?: boolean;
  avoidFerries?: boolean;
  avoidHighways?: boolean;
};

export type EtaEstimate = {
  baseDurationSeconds: number;
  trafficAdjustmentSeconds: number;
  totalDurationSeconds: number;
  arrivalTimeMs: number;
};

export type ProviderAvailability = {
  available: boolean;
  offlineCapable: boolean;
  reason?: string;
};
