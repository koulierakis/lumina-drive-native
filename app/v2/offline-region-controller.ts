import type { OfflineRegionProvider } from './providers';
import { listOfflineRegions, removeOfflineRegionRecord, saveOfflineRegion } from './offline-regions-store';
import type { BoundingBox, OfflineRegion } from './types';

export async function createOfflineRegion(
  provider: OfflineRegionProvider,
  input: { name: string; bounds: BoundingBox; minZoom?: number; maxZoom?: number },
): Promise<OfflineRegion> {
  const status = await provider.availability();
  if (!status.available) throw new Error(status.reason ?? 'Offline map provider unavailable');

  const created = await provider.create({
    name: input.name,
    bounds: input.bounds,
    minZoom: input.minZoom ?? 6,
    maxZoom: input.maxZoom ?? 16,
  });
  await saveOfflineRegion(created);
  return created;
}

export async function syncOfflineRegions(provider: OfflineRegionProvider): Promise<OfflineRegion[]> {
  const status = await provider.availability();
  if (!status.available) return listOfflineRegions();

  const regions = await provider.list();
  await Promise.all(regions.map((region) => saveOfflineRegion(region)));
  return regions;
}

export async function deleteOfflineRegion(provider: OfflineRegionProvider, id: string): Promise<void> {
  const status = await provider.availability();
  if (status.available) await provider.remove(id);
  await removeOfflineRegionRecord(id);
}
