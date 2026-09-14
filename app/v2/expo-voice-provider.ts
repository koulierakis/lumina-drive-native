import * as Speech from 'expo-speech';
import type { VoiceProvider } from './providers';
import type { ProviderAvailability } from './types';

export class ExpoVoiceProvider implements VoiceProvider {
  readonly id = 'expo-speech';

  async availability(): Promise<ProviderAvailability> {
    return { available: true, offlineCapable: false };
  }

  async speak(text: string, language = 'el-GR'): Promise<void> {
    await Speech.stop();
    Speech.speak(text, {
      language,
      rate: 0.94,
      pitch: 1,
    });
  }

  async stop(): Promise<void> {
    await Speech.stop();
  }
}
