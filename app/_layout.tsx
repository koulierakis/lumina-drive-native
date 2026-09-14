import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';

const MAPBOX_TOKEN_KEY = 'lumina-mapbox-public-token';

export default function RootLayout() {
  const [runtimeReady, setRuntimeReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function initializeRuntime() {
      const publicToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();

      if (publicToken?.startsWith('pk.')) {
        await AsyncStorage.setItem(MAPBOX_TOKEN_KEY, publicToken).catch(() => undefined);
      }

      if (active) setRuntimeReady(true);
    }

    initializeRuntime();
    return () => {
      active = false;
    };
  }, []);

  if (!runtimeReady) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#080b10' },
      }}
    />
  );
}