import type { MapProvider, OfflineRegionProvider, RoutingProvider, SearchProvider } from './providers';

export type OpenMapRuntime = {
  map: MapProvider;
  offlineRegions: OfflineRegionProvider;
  searchProviders: SearchProvider[];
  routingProviders: RoutingProvider[];
};

export type OpenMapRuntimeStatus = {
  mapReady: boolean;
  offlineRegionsReady: boolean;
  offlineSearchReady: boolean;
  offlineRoutingReady: boolean;
  degradedReasons: string[];
};

export async function inspectOpenMapRuntime(runtime: OpenMapRuntime): Promise<OpenMapRuntimeStatus> {
  const degradedReasons: string[] = [];
  const map = await runtime.map.availability().catch((error) => ({ available: false, offlineCapable: false, reason: String(error) }));
  const offlineRegions = await runtime.offlineRegions.availability().catch((error) => ({ available: false, offlineCapable: false, reason: String(error) }));

  let offlineSearchReady = false;
  for (const provider of runtime.searchProviders) {
    try {
      const status = await provider.availability();
      if (status.available && status.offlineCapable) { offlineSearchReady = true; break; }
    } catch {}
  }

  let offlineRoutingReady = false;
  for (const provider of runtime.routingProviders) {
    try {
      const status = await provider.availability();
      if (status.available && status.offlineCapable) { offlineRoutingReady = true; break; }
    } catch {}
  }

  if (!map.available) degradedReasons.push(`map: ${map.reason ?? 'unavailable'}`);
  if (!offlineRegions.available) degradedReasons.push(`offline regions: ${offlineRegions.reason ?? 'unavailable'}`);
  if (!offlineSearchReady) degradedReasons.push('offline search engine not connected');
  if (!offlineRoutingReady) degradedReasons.push('offline routing engine not connected');

  return {
    mapReady: map.available,
    offlineRegionsReady: offlineRegions.available,
    offlineSearchReady,
    offlineRoutingReady,
    degradedReasons,
  };
}
