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

// Driver Assistance V2 canonical telemetry and persistence contracts.
// These extend the existing navigation domain instead of replacing it.
export type ObdConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'initializing' | 'connected' | 'error';

export type ObdTelemetry = {
  engineRpm: number | null;
  vehicleSpeed: number | null;
  coolantTemp: number | null;
  fuelLevel: number | null;
  timestamp: number;
};

export type TrafficSignDetection = {
  label: string;
  confidence: number;
  speedLimitKph?: number;
};

export type VisionResult = {
  timestamp: number;
  trafficSigns: TrafficSignDetection[];
  laneConfidence?: number;
  forwardCollisionWarning?: boolean;
  tailgatingDetected?: boolean;
};

export type DriverAlertSeverity = 'info' | 'warning' | 'critical';
export type DriverAlertType = 'high-rpm' | 'coolant-temperature' | 'speed-limit' | 'forward-collision' | 'tailgating' | 'obd-error';

export type DriverAlert = {
  id: string;
  type: DriverAlertType;
  severity: DriverAlertSeverity;
  title: string;
  message: string;
  voiceMessage?: string;
  timestamp: number;
  value?: number;
  threshold?: number;
  metadata?: Record<string, unknown>;
};

export type TripMetrics = {
  initialScore: number;
  finalScore: number;
  totalAlertsCount: number;
  criticalAlertsCount: number;
  warningAlertsCount: number;
  infoAlertsCount: number;
  durationMs: number;
  maxSpeed: number;
  averageSpeed: number;
};

export type SyncStatus = 'pending' | 'syncing' | 'failed' | 'synced';
export type TripStatus = 'idle' | 'active' | 'completed';

export type TelemetrySample = {
  timestamp: number;
  vehicleSpeed: number | null;
  engineRpm: number | null;
  coolantTemp: number | null;
};

export type TripSession = {
  id: string;
  status: TripStatus;
  startTime: number;
  endTime: number | null;
  samples: TelemetrySample[];
  alerts: DriverAlert[];
  metrics: TripMetrics | null;
  syncStatus: SyncStatus;
};

export type GpsPoint = {
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  accuracy: number;
  timestamp: number;
};
