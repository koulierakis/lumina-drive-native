import { NetworkManager } from '@maplibre/maplibre-react-native';
import { Platform } from 'react-native';
import type { MapProvider } from './providers';
import type { ProviderAvailability } from './types';

export class MapLibreMapProvider implements MapProvider {
  readonly id = 'maplibre-native';

  async availability(): Promise<ProviderAvailability> {
    return { available: Platform.OS === 'android' || Platform.OS === 'ios', offlineCapable: true };
  }

  async setNetworkEnabled(enabled: boolean): Promise<void> {
    if (Platform.OS === 'android') NetworkManager.setConnected(enabled);
  }
}
