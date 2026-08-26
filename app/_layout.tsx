import AsyncStorage from '@react-native-async-storage/async-storage';
import Mapbox from '@rnmapbox/maps';
import { Stack } from 'expo-router';
import { useEffect } from 'react';

const MAPBOX_TOKEN_KEY = 'lumina-mapbox-public-token';

export default function RootLayout() {
  useEffect(() => {
    const publicToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
    if (!publicToken?.startsWith('pk.')) return;

    Mapbox.setAccessToken(publicToken);
    AsyncStorage.setItem(MAPBOX_TOKEN_KEY, publicToken).catch(() => undefined);
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#080b10' },
      }}
    />
  );
}
