import type { GeoPoint, RouteRequest } from './types';
import type { InstalledRoutingPackage, RoutingPackageManifest } from './offline-routing-packages';

export function boundsContainPoint(
  bounds: RoutingPackageManifest['bounds'],
  point: GeoPoint,
  marginDegrees = 0,
) {
  return point.lat <= bounds.north + marginDegrees
    && point.lat >= bounds.south - marginDegrees
    && point.lng <= bounds.east + marginDegrees
    && point.lng >= bounds.west - marginDegrees;
}

export function routeRequestPoints(request: RouteRequest): GeoPoint[] {
  return [request.origin, ...(request.waypoints ?? []), request.destination];
}

export function packageCoversRoute(
  manifest: RoutingPackageManifest,
  request: RouteRequest,
  marginDegrees = 0,
) {
  return routeRequestPoints(request).every((point) =>
    boundsContainPoint(manifest.bounds, point, marginDegrees),
  );
}

function area(manifest: RoutingPackageManifest) {
  const latSpan = Math.max(0, manifest.bounds.north - manifest.bounds.south);
  const lngSpan = Math.max(0, manifest.bounds.east - manifest.bounds.west);
  return latSpan * lngSpan;
}

export function selectReadyRoutingPackage(
  packages: InstalledRoutingPackage[],
  request: RouteRequest,
): InstalledRoutingPackage | null {
  const candidates = packages
    .filter((record) => record.state === 'ready' && Boolean(record.installedPath))
    .filter((record) => packageCoversRoute(record.manifest, request))
    .sort((a, b) => {
      const areaDelta = area(a.manifest) - area(b.manifest);
      if (areaDelta !== 0) return areaDelta;
      return b.manifest.version.localeCompare(a.manifest.version, undefined, { numeric: true });
    });

  return candidates[0] ?? null;
}

export function missingCoveragePoints(
  manifest: RoutingPackageManifest,
  request: RouteRequest,
): GeoPoint[] {
  return routeRequestPoints(request).filter((point) => !boundsContainPoint(manifest.bounds, point));
}
