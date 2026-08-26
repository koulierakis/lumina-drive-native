import AsyncStorage from '@react-native-async-storage/async-storage';
import Mapbox from '@rnmapbox/maps';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';

const MAPBOX_TOKEN_KEY = 'lumina-mapbox-public-token';

export default function RootLayout() {
  const [mapboxReady, setMapboxReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function initializeMapbox() {
      const publicToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();

      if (publicToken?.startsWith('pk.')) {
        Mapbox.setAccessToken(publicToken);
        await AsyncStorage.setItem(MAPBOX_TOKEN_KEY, publicToken).catch(() => undefined);
      }

      if (active) setMapboxReady(true);
    }

    initializeMapbox();
    return () => {
      active = false;
    };
  }, []);

  if (!mapboxReady) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#080b10' },
      }}
    />
  );
}
