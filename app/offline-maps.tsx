import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { MapLibreMapSurface } from './v2/maplibre-map-surface';
import { MapLibreOfflineRegionProvider } from './v2/maplibre-offline-region-provider';
import type { GeoPoint, OfflineRegion } from './v2/types';

const FALLBACK_CENTER: GeoPoint = { lat: 39.5553, lng: 21.7679 };
const REGION_DELTA = 0.06;

export default function OfflineMapsPreviewScreen() {
  const provider = useMemo(() => new MapLibreOfflineRegionProvider(), []);
  const [center, setCenter] = useState<GeoPoint>(FALLBACK_CENTER);
  const [regions, setRegions] = useState<OfflineRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRegions(await provider.list());
    } catch (error) {
      Alert.alert('Offline maps', error instanceof Error ? error.message : 'Αδυναμία φόρτωσης offline περιοχών.');
    }
  }, [provider]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status === 'granted') {
          const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          if (mounted) setCenter({ lat: location.coords.latitude, lng: location.coords.longitude });
        }
        await refresh();
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [refresh]);

  const downloadCurrentArea = useCallback(async () => {
    setDownloading(true);
    try {
      await provider.create({
        name: `Περιοχή ${center.lat.toFixed(3)}, ${center.lng.toFixed(3)}`,
        bounds: {
          west: center.lng - REGION_DELTA,
          south: center.lat - REGION_DELTA,
          east: center.lng + REGION_DELTA,
          north: center.lat + REGION_DELTA,
        },
        minZoom: 10,
        maxZoom: 16,
      });
      await refresh();
    } catch (error) {
      Alert.alert('Λήψη χάρτη', error instanceof Error ? error.message : 'Η λήψη απέτυχε.');
    } finally {
      setDownloading(false);
    }
  }, [center, provider, refresh]);

  const removeRegion = useCallback(async (id: string) => {
    try {
      await provider.remove(id);
      await refresh();
    } catch (error) {
      Alert.alert('Διαγραφή χάρτη', error instanceof Error ? error.message : 'Η διαγραφή απέτυχε.');
    }
  }, [provider, refresh]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.mapArea}>
        <MapLibreMapSurface center={center} zoom={13} trackUserLocation />
      </View>
      <View style={styles.panel}>
        <Text style={styles.title}>LUMINA Offline Maps</Text>
        <Text style={styles.subtitle}>MapLibre + OpenStreetMap / OpenFreeMap</Text>
        <Pressable style={styles.primaryButton} onPress={downloadCurrentArea} disabled={downloading}>
          <Text style={styles.primaryText}>{downloading ? 'Γίνεται λήψη…' : 'Λήψη τρέχουσας περιοχής'}</Text>
        </Pressable>
        {loading ? <ActivityIndicator /> : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {regions.length === 0 ? <Text style={styles.empty}>Δεν υπάρχουν αποθηκευμένες περιοχές.</Text> : null}
            {regions.map((region) => (
              <View key={region.id} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.regionName}>{region.name}</Text>
                  <Text style={styles.regionMeta}>{region.status} · {Math.round(region.progress)}%</Text>
                </View>
                <Pressable style={styles.deleteButton} onPress={() => removeRegion(region.id)}>
                  <Text style={styles.deleteText}>Διαγραφή</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070b12' },
  mapArea: { flex: 1 },
  panel: { minHeight: 280, padding: 16, gap: 10, backgroundColor: '#0d1420' },
  title: { color: '#ffffff', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#9aa8bb', fontSize: 13 },
  primaryButton: { backgroundColor: '#246bfd', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  primaryText: { color: '#ffffff', fontWeight: '700' },
  list: { maxHeight: 150 },
  listContent: { gap: 8 },
  empty: { color: '#8290a3', paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowText: { flex: 1 },
  regionName: { color: '#ffffff', fontWeight: '600' },
  regionMeta: { color: '#91a0b4', marginTop: 2 },
  deleteButton: { borderWidth: 1, borderColor: '#3b4658', borderRadius: 9, paddingVertical: 8, paddingHorizontal: 10 },
  deleteText: { color: '#dbe4f0', fontSize: 12 },
});
