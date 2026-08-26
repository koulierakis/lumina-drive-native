import AsyncStorage from '@react-native-async-storage/async-storage';
import Mapbox from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Point = { lat: number; lng: number };
type Poi = {
  id: string;
  name: string;
  address: string;
  category: string;
  point: Point;
  distance: number;
};
type RouteStep = {
  instruction: string;
  point: Point;
  distance: number;
  duration: number;
};
type RouteInfo = {
  geometry: {
    type: 'Feature';
    properties: Record<string, never>;
    geometry: { type: 'LineString'; coordinates: number[][] };
  };
  distance: number;
  duration: number;
  instruction: string;
  steps: RouteStep[];
};

const TOKEN_KEY = 'lumina-mapbox-public-token';
const SEARCH_API = 'https://api.mapbox.com/search/searchbox/v1/forward';
const DIRECTIONS_API = 'https://api.mapbox.com/directions/v5/mapbox/driving';
const categories = [
  ['restaurant', '🍽️ Εστιατόρια'],
  ['cafe', '☕ Καφέ'],
  ['fast food', '🌯 Fast food'],
  ['hotel', '🏨 Ξενοδοχεία'],
  ['apartments', '🏠 Διαμονή'],
  ['pharmacy', '💊 Φαρμακεία'],
  ['gas station', '⛽ Βενζίνη'],
  ['parking', '🅿️ Parking'],
  ['supermarket', '🛒 Supermarket'],
  ['bank', '🏦 Τράπεζες'],
  ['ATM', '💳 ATM'],
  ['hospital', '🏥 Νοσοκομεία'],
  ['gym', '🏋️ Γυμναστήρια'],
  ['beach', '🏖️ Παραλίες'],
  ['tourist attraction', '📍 Αξιοθέατα'],
] as const;

function toRad(v: number) {
  return (v * Math.PI) / 180;
}

function distanceMeters(a: Point, b: Point) {
  const R = 6371e3;
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dp = toRad(b.lat - a.lat);
  const dl = toRad(b.lng - a.lng);
  const x =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function fmtDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function fmtDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} λεπ`;
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  return min ? `${h} ω ${min} λεπ` : `${h} ω`;
}

function boundsFromCoordinates(coords: number[][]) {
  let minLng = coords[0][0];
  let maxLng = coords[0][0];
  let minLat = coords[0][1];
  let maxLat = coords[0][1];
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return {
    ne: [maxLng, maxLat] as [number, number],
    sw: [minLng, minLat] as [number, number],
  };
}

export default function HomeScreen() {
  const [token, setToken] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [position, setPosition] = useState<Point | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [loading, setLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [status, setStatus] = useState('Περιμένω GPS…');
  const [items, setItems] = useState<Poi[]>([]);
  const [selected, setSelected] = useState<Poi | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [navigationActive, setNavigationActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [lastCategory, setLastCategory] = useState('');
  const camera = useRef<Mapbox.Camera>(null);

  useEffect(() => {
    AsyncStorage.getItem(TOKEN_KEY).then((saved) => {
      if (saved?.startsWith('pk.')) {
        Mapbox.setAccessToken(saved);
        setToken(saved);
      }
    });
  }, []);

  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setGpsError('Δεν δόθηκε άδεια τοποθεσίας.');
        setStatus('GPS unavailable');
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPosition({ lat: current.coords.latitude, lng: current.coords.longitude });
      setAccuracy(current.coords.accuracy ?? null);
      setStatus('GPS ενεργό');
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 3000 },
        (loc) => {
          setPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          setAccuracy(loc.coords.accuracy ?? null);
          setGpsError('');
        },
      );
    })().catch((e) => {
      setGpsError(String(e?.message || e));
      setStatus('GPS unavailable');
    });
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    if (!navigationActive || !position || !route) return;

    camera.current?.setCamera({
      centerCoordinate: [position.lng, position.lat],
      zoomLevel: 16.2,
      pitch: 48,
      animationDuration: 650,
    });

    const currentStep = route.steps[stepIndex];
    if (currentStep) {
      const metersToManeuver = distanceMeters(position, currentStep.point);
      if (metersToManeuver < 35 && stepIndex < route.steps.length - 1) {
        setStepIndex((value) => Math.min(value + 1, route.steps.length - 1));
      }
    }

    if (selected && distanceMeters(position, selected.point) < 30) {
      setStatus(`Έφτασες στο ${selected.name}`);
    }
  }, [navigationActive, position, route, selected, stepIndex]);

  const center = useMemo<[number, number] | undefined>(
    () => (position ? [position.lng, position.lat] : undefined),
    [position],
  );

  const activeInstruction = useMemo(() => {
    if (!route) return '';
    return route.steps[stepIndex]?.instruction || route.instruction;
  }, [route, stepIndex]);

  const distanceToNextManeuver = useMemo(() => {
    if (!route || !position) return null;
    const step = route.steps[stepIndex];
    return step ? distanceMeters(position, step.point) : null;
  }, [route, position, stepIndex]);

  async function saveToken() {
    const value = tokenDraft.trim();
    if (!value.startsWith('pk.')) {
      Alert.alert('Mapbox token', 'Χρειάζεται public token που αρχίζει από pk.');
      return;
    }
    await AsyncStorage.setItem(TOKEN_KEY, value);
    Mapbox.setAccessToken(value);
    setToken(value);
    setTokenDraft('');
    setSettingsOpen(false);
  }

  async function searchMapbox(text: string) {
    if (!token) {
      setSettingsOpen(true);
      setStatus('Χρειάζεται Mapbox token');
      return;
    }
    if (!position) {
      setStatus('Περιμένω πραγματική θέση GPS…');
      return;
    }
    const q = text.trim();
    if (!q) return;
    setLoading(true);
    setItems([]);
    setSelected(null);
    setRoute(null);
    setNavigationActive(false);
    setStepIndex(0);
    setStatus(`Mapbox: αναζήτηση “${q}”…`);
    try {
      const url = new URL(SEARCH_API);
      url.searchParams.set('q', q);
      url.searchParams.set('access_token', token);
      url.searchParams.set('country', 'GR');
      url.searchParams.set('language', 'el');
      url.searchParams.set('limit', '10');
      url.searchParams.set('proximity', `${position.lng},${position.lat}`);
      url.searchParams.set('types', 'poi');
      const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      const raw = await response.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {}
      if (!response.ok) throw new Error(`Mapbox HTTP ${response.status}: ${data?.message || raw || 'error'}`);
      const parsed: Poi[] = (data.features || [])
        .map((f: any, index: number) => {
          const coords = f?.geometry?.coordinates;
          const p = f?.properties || {};
          if (!Array.isArray(coords) || coords.length < 2 || !p.name) return null;
          const point = { lat: Number(coords[1]), lng: Number(coords[0]) };
          if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
          return {
            id: String(f.id || `${p.name}-${index}`),
            name: String(p.name),
            address: String(p.full_address || p.place_formatted || p.address || '—'),
            category: String(p.poi_category?.[0] || p.maki || q),
            point,
            distance: distanceMeters(position, point),
          } satisfies Poi;
        })
        .filter(Boolean)
        .filter((x: Poi) => x.distance <= 10000)
        .sort((a: Poi, b: Poi) => a.distance - b.distance);
      setItems(parsed);
      setStatus(parsed.length ? `${parsed.length} αποτελέσματα · κοντινότερο πρώτο` : 'Δεν βρέθηκαν κοντινά σημεία.');
    } catch (e: any) {
      setStatus(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function calculateRoute(poi: Poi) {
    if (!position || !token) return;
    setSelected(poi);
    setRouteLoading(true);
    setRoute(null);
    setNavigationActive(false);
    setStepIndex(0);
    setStatus(`Υπολογίζω διαδρομή προς ${poi.name}…`);
    try {
      const coordinates = `${position.lng},${position.lat};${poi.point.lng},${poi.point.lat}`;
      const url = new URL(`${DIRECTIONS_API}/${coordinates}`);
      url.searchParams.set('access_token', token);
      url.searchParams.set('geometries', 'geojson');
      url.searchParams.set('overview', 'full');
      url.searchParams.set('steps', 'true');
      url.searchParams.set('language', 'el');
      url.searchParams.set('voice_instructions', 'true');
      const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      const raw = await response.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {}
      if (!response.ok) throw new Error(`Directions HTTP ${response.status}: ${data?.message || raw || 'error'}`);
      const first = data?.routes?.[0];
      const coords = first?.geometry?.coordinates;
      if (!first || !Array.isArray(coords) || coords.length < 2) throw new Error('Δεν βρέθηκε οδική διαδρομή.');
      const rawSteps = first?.legs?.[0]?.steps || [];
      const steps: RouteStep[] = rawSteps
        .map((step: any) => {
          const location = step?.maneuver?.location;
          if (!Array.isArray(location) || location.length < 2) return null;
          return {
            instruction: String(step?.maneuver?.instruction || 'Συνέχισε στη διαδρομή'),
            point: { lng: Number(location[0]), lat: Number(location[1]) },
            distance: Number(step?.distance || 0),
            duration: Number(step?.duration || 0),
          } satisfies RouteStep;
        })
        .filter(Boolean);
      const instruction = steps[0]?.instruction || `Πορεία προς ${poi.name}`;
      const info: RouteInfo = {
        geometry: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        },
        distance: Number(first.distance || 0),
        duration: Number(first.duration || 0),
        instruction,
        steps,
      };
      setRoute(info);
      setStatus(`Διαδρομή έτοιμη προς ${poi.name}`);
      const bounds = boundsFromCoordinates(coords);
      camera.current?.fitBounds(bounds.ne, bounds.sw, [70, 45, 70, 45], 700);
    } catch (e: any) {
      setStatus(String(e?.message || e));
      Alert.alert('Πλοήγηση', String(e?.message || e));
    } finally {
      setRouteLoading(false);
    }
  }

  function beginGuidance() {
    if (!route || !position || !selected) return;
    setNavigationActive(true);
    setStepIndex(0);
    setStatus(`Καθοδήγηση ενεργή προς ${selected.name}`);
    camera.current?.setCamera({
      centerCoordinate: [position.lng, position.lat],
      zoomLevel: 16.2,
      pitch: 48,
      animationDuration: 700,
    });
  }

  function stopNavigation() {
    setNavigationActive(false);
    setRoute(null);
    setSelected(null);
    setStepIndex(0);
    setStatus('GPS ενεργό');
    if (center) {
      camera.current?.setCamera({ centerCoordinate: center, zoomLevel: 15, pitch: 0, animationDuration: 500 });
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>LUMINA</Text>
            <Text style={styles.title}>Drive Assistant</Text>
          </View>
          <Pressable style={styles.headerButton} onPress={() => setSettingsOpen(true)}>
            <Text style={styles.headerButtonText}>☰</Text>
          </Pressable>
        </View>

        {route ? (
          <View style={[styles.turnBanner, navigationActive && styles.turnBannerActive]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.turnEyebrow}>{navigationActive ? 'ΚΑΘΟΔΗΓΗΣΗ ΕΝΕΡΓΗ' : 'ΔΙΑΔΡΟΜΗ ΕΤΟΙΜΗ'} · {selected?.name}</Text>
              <Text style={styles.turnInstruction}>{activeInstruction}</Text>
              <Text style={styles.turnMeta}>
                {navigationActive && distanceToNextManeuver != null
                  ? `${fmtDistance(distanceToNextManeuver)} μέχρι την επόμενη οδηγία · `
                  : ''}
                {fmtDistance(route.distance)} · {fmtDuration(route.duration)}
              </Text>
              {!navigationActive ? (
                <Pressable style={styles.beginButton} onPress={beginGuidance}>
                  <Text style={styles.beginButtonText}>▶ ΕΝΑΡΞΗ ΚΑΘΟΔΗΓΗΣΗΣ</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable style={styles.stopButton} onPress={stopNavigation}>
              <Text style={styles.stopButtonText}>✕</Text>
            </Pressable>
          </View>
        ) : null}

        {!navigationActive ? (
          <>
            <View style={styles.gpsBar}>
              <View style={{ flex: 1 }}>
                <Text style={styles.gpsValue}>{position ? 'GPS ενεργό' : 'GPS αναμονή'}</Text>
                <Text style={styles.gpsMeta} numberOfLines={1}>
                  {position
                    ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}${accuracy ? ` · ±${Math.round(accuracy)}m` : ''}`
                    : gpsError || 'Αναμονή πραγματικής θέσης'}
                </Text>
              </View>
              <Pressable
                style={styles.centerButton}
                onPress={() =>
                  center && camera.current?.setCamera({ centerCoordinate: center, zoomLevel: 15, animationDuration: 500 })
                }
              >
                <Text style={styles.centerButtonText}>◎</Text>
              </Pressable>
            </View>

            <View style={styles.searchRow}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Όνομα ή διεύθυνση…"
                placeholderTextColor="#7d8796"
                style={styles.searchInput}
                returnKeyType="search"
                onSubmitEditing={() => searchMapbox(query)}
              />
              <Pressable style={styles.searchButton} onPress={() => searchMapbox(query)}>
                <Text style={styles.searchButtonText}>Αναζήτηση</Text>
              </Pressable>
            </View>

            <FlatList
              horizontal
              data={categories}
              keyExtractor={(x) => x[0]}
              showsHorizontalScrollIndicator={false}
              style={styles.categoriesList}
              contentContainerStyle={styles.categories}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.category, lastCategory === item[0] && styles.categoryActive]}
                  onPress={() => {
                    setLastCategory(item[0]);
                    searchMapbox(item[0]);
                  }}
                >
                  <Text style={styles.categoryText} numberOfLines={1}>{item[1]}</Text>
                </Pressable>
              )}
            />

            <View style={styles.statusBox}>
              {loading || routeLoading ? <ActivityIndicator /> : null}
              <Text style={styles.statusText}>{status}</Text>
            </View>

            {items.length > 0 ? (
              <View style={styles.resultsBlock}>
                <Text style={styles.resultsTitle}>Κοντινά σημεία</Text>
                {items.map((item, index) => (
                  <Pressable key={item.id} style={styles.resultCard} onPress={() => calculateRoute(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultTitle} numberOfLines={1}>{index + 1}. {item.name}</Text>
                      <Text style={styles.resultMeta} numberOfLines={2}>{fmtDistance(item.distance)} · {item.address}</Text>
                    </View>
                    <Text style={styles.startText}>▶</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        <View style={[styles.mapWrap, navigationActive && styles.mapWrapNavigation]}>
          {token ? (
            <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Street}>
              <Mapbox.Camera ref={camera} zoomLevel={13} centerCoordinate={center} />
              {position ? <Mapbox.LocationPuck puckBearingEnabled pulsing={{ isEnabled: true }} /> : null}
              {route ? (
                <Mapbox.ShapeSource id="navigation-route" shape={route.geometry}>
                  <Mapbox.LineLayer
                    id="navigation-route-line"
                    style={{ lineColor: '#2d96ff', lineWidth: navigationActive ? 9 : 7, lineCap: 'round', lineJoin: 'round' }}
                  />
                </Mapbox.ShapeSource>
              ) : null}
              {selected ? (
                <Mapbox.PointAnnotation id="selected-destination" coordinate={[selected.point.lng, selected.point.lat]} />
              ) : null}
            </Mapbox.MapView>
          ) : (
            <Pressable style={styles.mapPlaceholder} onPress={() => setSettingsOpen(true)}>
              <Text style={styles.mapPlaceholderTitle}>Mapbox token δεν έχει οριστεί</Text>
              <Text style={styles.mapPlaceholderText}>Πάτησε εδώ για να προσθέσεις public token (pk…).</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <Modal visible={settingsOpen} transparent animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mapbox — Σημεία ενδιαφέροντος</Text>
            <Text style={styles.modalText}>
              {token ? 'Public token αποθηκευμένο σε αυτή τη συσκευή.' : 'Δεν υπάρχει αποθηκευμένο Mapbox token.'}
            </Text>
            <TextInput
              secureTextEntry
              autoCapitalize="none"
              value={tokenDraft}
              onChangeText={setTokenDraft}
              placeholder="Mapbox public token (pk....)"
              placeholderTextColor="#7d8796"
              style={styles.modalInput}
            />
            <Pressable style={styles.modalSave} onPress={saveToken}>
              <Text style={styles.modalSaveText}>Αποθήκευση token</Text>
            </Pressable>
            <Pressable style={styles.modalClose} onPress={() => setSettingsOpen(false)}>
              <Text style={styles.modalCloseText}>Κλείσιμο</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080b10' },
  screen: { paddingBottom: 28 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#5ba8ff', letterSpacing: 4, fontSize: 11, fontWeight: '800' },
  title: { color: '#fff', fontSize: 23, fontWeight: '800', marginTop: 2 },
  headerButton: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#141b24', alignItems: 'center', justifyContent: 'center' },
  headerButtonText: { color: '#fff', fontSize: 25, fontWeight: '700' },
  turnBanner: { marginHorizontal: 16, marginBottom: 10, padding: 14, backgroundColor: '#0f3153', borderRadius: 18, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#2d96ff' },
  turnBannerActive: { backgroundColor: '#0b2239', borderColor: '#5ce1d2' },
  turnEyebrow: { color: '#69b5ff', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  turnInstruction: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 4 },
  turnMeta: { color: '#b9cde1', fontSize: 15, marginTop: 5, fontWeight: '700' },
  beginButton: { marginTop: 12, minHeight: 48, borderRadius: 15, backgroundColor: '#2d96ff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  beginButtonText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  stopButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#1c2b3a', alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  stopButtonText: { color: '#fff', fontSize: 19, fontWeight: '900' },
  gpsBar: { marginHorizontal: 16, marginBottom: 12, padding: 15, borderRadius: 22, backgroundColor: '#141b24', flexDirection: 'row', alignItems: 'center' },
  gpsValue: { color: '#5ce1d2', fontSize: 18, fontWeight: '900' },
  gpsMeta: { color: '#8e99a9', fontSize: 14, marginTop: 4 },
  centerButton: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#2d96ff', alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  centerButtonText: { color: '#fff', fontSize: 25, fontWeight: '900' },
  searchRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 10 },
  searchInput: { flex: 1, backgroundColor: '#141b24', color: '#fff', borderRadius: 18, paddingHorizontal: 15, minHeight: 52, fontSize: 16 },
  searchButton: { backgroundColor: '#2d96ff', borderRadius: 18, minHeight: 52, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  searchButtonText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  categoriesList: { marginBottom: 10 },
  categories: { paddingHorizontal: 16, gap: 8 },
  category: { backgroundColor: '#141b24', borderRadius: 17, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'transparent' },
  categoryActive: { borderColor: '#2d96ff', backgroundColor: '#17314c' },
  categoryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  statusBox: { marginHorizontal: 16, marginBottom: 14, padding: 13, borderRadius: 16, backgroundColor: '#111820', flexDirection: 'row', alignItems: 'center', gap: 9 },
  statusText: { color: '#c8d0db', fontSize: 15, flex: 1 },
  resultsBlock: { marginHorizontal: 16, marginBottom: 12 },
  resultsTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 10 },
  resultCard: { minHeight: 78, backgroundColor: '#141b24', borderRadius: 18, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  resultTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  resultMeta: { color: '#97a2b1', fontSize: 14, marginTop: 5, lineHeight: 19 },
  startText: { color: '#4aa8ff', fontSize: 28, fontWeight: '900', marginLeft: 10 },
  mapWrap: { height: 420, marginHorizontal: 16, borderRadius: 24, overflow: 'hidden', backgroundColor: '#111820' },
  mapWrapNavigation: { height: 610, borderRadius: 20 },
  map: { flex: 1 },
  mapPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  mapPlaceholderTitle: { color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  mapPlaceholderText: { color: '#9aa5b4', fontSize: 15, textAlign: 'center', marginTop: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#111820', padding: 20, paddingBottom: 32, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  modalTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  modalText: { color: '#9aa5b4', marginTop: 8, marginBottom: 14, lineHeight: 20 },
  modalInput: { backgroundColor: '#080b10', color: '#fff', borderRadius: 16, minHeight: 52, paddingHorizontal: 14, borderWidth: 1, borderColor: '#27313d' },
  modalSave: { backgroundColor: '#2d96ff', borderRadius: 16, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  modalSaveText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  modalClose: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  modalCloseText: { color: '#b3bdca', fontWeight: '800' },
});