import {
  OfflineManager,
  type OfflinePack,
  type OfflinePackStatus,
} from '@maplibre/maplibre-react-native';
import type { OfflineRegionCreateRequest, OfflineRegionProvider } from './providers';
import type { BoundingBox, OfflineRegion, OfflineRegionStatus, ProviderAvailability } from './types';

const DEFAULT_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

function toBounds(bounds: readonly number[]): BoundingBox {
  const [west, south, east, north] = bounds;
  return {
    west: Number(west),
    south: Number(south),
    east: Number(east),
    north: Number(north),
  };
}

function toStatus(status: OfflinePackStatus): OfflineRegionStatus {
  if (status.state === 'complete') return 'ready';
  if (status.state === 'active') return 'downloading';
  return 'queued';
}

function metadataNumber(pack: OfflinePack, key: string, fallback: number): number {
  const value = pack.metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function metadataString(pack: OfflinePack, key: string, fallback: string): string {
  const value = pack.metadata[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

async function packToRegion(pack: OfflinePack): Promise<OfflineRegion> {
  const status = await pack.status();
  const createdAt = metadataString(pack, 'createdAt', new Date().toISOString());
  return {
    id: pack.id,
    name: metadataString(pack, 'name', `Offline region ${pack.id.slice(0, 8)}`),
    bounds: toBounds(pack.bounds),
    minZoom: metadataNumber(pack, 'minZoom', 6),
    maxZoom: metadataNumber(pack, 'maxZoom', 16),
    status: toStatus(status),
    progress: Math.max(0, Math.min(100, status.percentage)),
    createdAt,
    updatedAt: new Date().toISOString(),
  };
}

export class MapLibreOfflineRegionProvider implements OfflineRegionProvider {
  readonly id = 'maplibre-offline';

  constructor(private readonly mapStyle = DEFAULT_MAP_STYLE) {}

  async availability(): Promise<ProviderAvailability> {
    return { available: true, offlineCapable: true };
  }

  async list(): Promise<OfflineRegion[]> {
    const packs = await OfflineManager.getPacks();
    return Promise.all(packs.map(packToRegion));
  }

  async create(request: OfflineRegionCreateRequest): Promise<OfflineRegion> {
    const createdAt = new Date().toISOString();
    const pack = await OfflineManager.createPack(
      {
        mapStyle: this.mapStyle,
        bounds: [request.bounds.west, request.bounds.south, request.bounds.east, request.bounds.north],
        minZoom: request.minZoom,
        maxZoom: request.maxZoom,
        metadata: {
          name: request.name,
          minZoom: request.minZoom,
          maxZoom: request.maxZoom,
          createdAt,
          mapStyle: this.mapStyle,
        },
      },
      () => undefined,
      () => undefined,
    );
    await pack.resume();
    return packToRegion(pack);
  }

  async remove(regionId: string): Promise<void> {
    await OfflineManager.deletePack(regionId);
  }
}

export const OPENFREEMAP_LIBERTY_STYLE = DEFAULT_MAP_STYLE;
