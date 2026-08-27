import AsyncStorage from '@react-native-async-storage/async-storage';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  geometry: GeoJSON.Feature<GeoJSON.LineString>;
  distance: number;
  duration: number;
  instruction: string;
  steps: RouteStep[];
};

type WebMapProps = {
  token: string;
  position: Point | null;
  route: RouteInfo | null;
  selected: Poi | null;
  navigationActive: boolean;
  centerNonce: number;
};

const TOKEN_KEY = 'lumina-mapbox-public-token';
const SEARCH_API = 'https://api.mapbox.com/search/searchbox/v1/forward';
const DIRECTIONS_API = 'https://api.mapbox.com/directions/v5/mapbox/driving';
const VOICE_THRESHOLDS = [300, 100, 50] as const;
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
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
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

function speakGreek(message: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = 'el-GR';
  utterance.rate = 0.94;
  window.speechSynthesis.speak(utterance);
}

function WebMap({ token, position, route, selected, navigationActive, centerNonce }: WebMapProps) {
  const hostRef = useRef<any>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destinationMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const node = hostRef.current as HTMLElement | null;
    if (!node || !token || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: node,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: position ? [position.lng, position.lat] : [23.7275, 37.9838],
      zoom: position ? 13 : 5.5,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');
    map.on('load', () => setReady(true));
    mapRef.current = map;
    return () => {
      userMarkerRef.current?.remove();
      destinationMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;
    if (!userMarkerRef.current) {
      userMarkerRef.current = new mapboxgl.Marker({ color: '#39d6b4' }).setLngLat([position.lng, position.lat]).addTo(map);
    } else {
      userMarkerRef.current.setLngLat([position.lng, position.lat]);
    }
    if (navigationActive) {
      map.easeTo({ center: [position.lng, position.lat], zoom: 16.2, pitch: 48, duration: 650 });
    }
  }, [position, navigationActive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;
    map.easeTo({ center: [position.lng, position.lat], zoom: 15, pitch: navigationActive ? 48 : 0, duration: 500 });
  }, [centerNonce]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const sourceId = 'lumina-route';
    const layerId = 'lumina-route-line';
    const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
    if (!route) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }
    if (source) {
      source.setData(route.geometry);
    } else {
      map.addSource(sourceId, { type: 'geojson', data: route.geometry });
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#73C7FF', 'line-width': navigationActive ? 9 : 7 },
      });
    }
    const coords = route.geometry.geometry.coordinates;
    const bounds = coords.reduce(
      (b, c) => b.extend(c as [number, number]),
      new mapboxgl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]),
    );
    if (!navigationActive) map.fitBounds(bounds, { padding: 60, duration: 700 });
  }, [route, ready, navigationActive]);

  useEffect(() => {
    const map = mapRef.current;
    destinationMarkerRef.current?.remove();
    destinationMarkerRef.current = null;
    if (!map || !selected) return;
    destinationMarkerRef.current = new mapboxgl.Marker({ color: '#e0b968' })
      .setLngLat([selected.point.lng, selected.point.lat])
      .addTo(map);
  }, [selected]);

  return <View ref={hostRef} style={styles.map} />;
}

export default function HomeScreen() {
  const [token, setToken] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [position, setPosition] = useState<Point | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speedKmh, setSpeedKmh] = useState(0);
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
  const [centerNonce, setCenterNonce] = useState(0);
  const spokenMilestones = useRef<Set<string>>(new Set());
  const arrivalSpoken = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(TOKEN_KEY).then((saved) => {
      if (saved?.startsWith('pk.')) setToken(saved);
    });
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Ο browser δεν υποστηρίζει GPS.');
      setStatus('GPS unavailable');
      return;
    }
    const applyPosition = (p: GeolocationPosition) => {
      setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
      setAccuracy(p.coords.accuracy ?? null);
      setSpeedKmh(Math.max(0, Math.round((p.coords.speed ?? 0) * 3.6)));
      setGpsError('');
      setStatus('GPS ενεργό');
    };
    const fail = (e: GeolocationPositionError) => {
      setGpsError(e.message || 'Δεν δόθηκε άδεια τοποθεσίας.');
      setStatus('GPS unavailable');
    };
    navigator.geolocation.getCurrentPosition(applyPosition, fail, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    const watchId = navigator.geolocation.watchPosition(applyPosition, fail, {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 15000,
    });
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!navigationActive || !position || !route) return;
    const currentStep = route.steps[stepIndex];
    if (currentStep) {
      const metersToManeuver = distanceMeters(position, currentStep.point);
      const threshold = metersToManeuver <= 50 ? 50 : metersToManeuver <= 100 ? 100 : metersToManeuver <= 300 ? 300 : null;
      if (threshold != null) {
        const key = `${stepIndex}:${threshold}`;
        if (!spokenMilestones.current.has(key)) {
          for (const passed of VOICE_THRESHOLDS) {
            if (passed >= threshold) spokenMilestones.current.add(`${stepIndex}:${passed}`);
          }
          speakGreek(`Σε ${threshold} μέτρα, ${currentStep.instruction}`);
        }
      }
      if (metersToManeuver < 35 && stepIndex < route.steps.length - 1) {
        setStepIndex((value) => Math.min(value + 1, route.steps.length - 1));
      }
    }
    if (selected && distanceMeters(position, selected.point) < 30) {
      setStatus(`Έφτασες στο ${selected.name}`);
      if (!arrivalSpoken.current) {
        arrivalSpoken.current = true;
        speakGreek(`Έφτασες στον προορισμό σου, ${selected.name}`);
      }
    }
  }, [navigationActive, position, route, selected, stepIndex]);

  const activeInstruction = useMemo(() => route?.steps[stepIndex]?.instruction || route?.instruction || '', [route, stepIndex]);
  const distanceToNextManeuver = useMemo(() => {
    if (!route || !position) return null;
    const step = route.steps[stepIndex];
    return step ? distanceMeters(position, step.point) : null;
  }, [route, position, stepIndex]);

  async function saveToken() {
    const value = tokenDraft.trim();
    if (!value.startsWith('pk.')) {
      setStatus('Χρειάζεται public Mapbox token που αρχίζει από pk.');
      return;
    }
    await AsyncStorage.setItem(TOKEN_KEY, value);
    setToken(value);
    setTokenDraft('');
    setSettingsOpen(false);
    setStatus('Mapbox token αποθηκεύτηκε.');
  }

  async function searchMapbox(text: string, nearbyOnly = false) {
    if (!token) {
      setSettingsOpen(true);
      setStatus('Χρειάζεται Mapbox token');
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
    spokenMilestones.current.clear();
    arrivalSpoken.current = false;
    setStatus(`Mapbox: αναζήτηση “${q}”…`);
    try {
      const url = new URL(SEARCH_API);
      url.searchParams.set('q', q);
      url.searchParams.set('access_token', token);
      url.searchParams.set('country', 'GR');
      url.searchParams.set('language', 'el');
      url.searchParams.set('limit', '10');
      url.searchParams.set('types', 'poi');
      if (position) url.searchParams.set('proximity', `${position.lng},${position.lat}`);
      const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      const raw = await response.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch {}
      if (!response.ok) throw new Error(`Mapbox HTTP ${response.status}: ${data?.message || raw || 'error'}`);
      let parsed: Poi[] = (data.features || [])
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
            distance: position ? distanceMeters(position, point) : 0,
          } as Poi;
        })
        .filter(Boolean);
      if (nearbyOnly && position) parsed = parsed.filter((x) => x.distance <= 20000);
      if (position) parsed.sort((a, b) => a.distance - b.distance);
      setItems(parsed);
      setStatus(parsed.length ? `${parsed.length} αποτελέσματα` : 'Δεν βρέθηκαν σημεία.');
    } catch (e: any) {
      setStatus(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function calculateRoute(poi: Poi) {
    if (!position || !token) {
      setStatus('Χρειάζεται ενεργό GPS και Mapbox token.');
      return;
    }
    setSelected(poi);
    setRouteLoading(true);
    setRoute(null);
    setNavigationActive(false);
    setStepIndex(0);
    spokenMilestones.current.clear();
    arrivalSpoken.current = false;
    setStatus(`Υπολογίζω διαδρομή προς ${poi.name}…`);
    try {
      const coordinates = `${position.lng},${position.lat};${poi.point.lng},${poi.point.lat}`;
      const url = new URL(`${DIRECTIONS_API}/${coordinates}`);
      url.searchParams.set('access_token', token);
      url.searchParams.set('geometries', 'geojson');
      url.searchParams.set('overview', 'full');
      url.searchParams.set('steps', 'true');
      url.searchParams.set('language', 'el');
      const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      const raw = await response.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch {}
      if (!response.ok) throw new Error(`Directions HTTP ${response.status}: ${data?.message || raw || 'error'}`);
      const first = data?.routes?.[0];
      const coords = first?.geometry?.coordinates;
      if (!first || !Array.isArray(coords) || coords.length < 2) throw new Error('Δεν βρέθηκε οδική διαδρομή.');
      const steps: RouteStep[] = (first?.legs?.[0]?.steps || [])
        .map((step: any) => {
          const location = step?.maneuver?.location;
          if (!Array.isArray(location) || location.length < 2) return null;
          return {
            instruction: String(step?.maneuver?.instruction || 'Συνέχισε στη διαδρομή'),
            point: { lng: Number(location[0]), lat: Number(location[1]) },
            distance: Number(step?.distance || 0),
            duration: Number(step?.duration || 0),
          } as RouteStep;
        })
        .filter(Boolean);
      const info: RouteInfo = {
        geometry: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
        distance: Number(first.distance || 0),
        duration: Number(first.duration || 0),
        instruction: steps[0]?.instruction || `Πορεία προς ${poi.name}`,
        steps,
      };
      setRoute(info);
      setStatus(`Διαδρομή έτοιμη προς ${poi.name}`);
    } catch (e: any) {
      setStatus(String(e?.message || e));
    } finally {
      setRouteLoading(false);
    }
  }

  function beginGuidance() {
    if (!route || !position || !selected) return;
    spokenMilestones.current.clear();
    arrivalSpoken.current = false;
    setNavigationActive(true);
    setStepIndex(0);
    setStatus(`Καθοδήγηση ενεργή προς ${selected.name}`);
    speakGreek(`Η καθοδήγηση ξεκίνησε προς ${selected.name}`);
  }

  function stopNavigation() {
    setNavigationActive(false);
    setRoute(null);
    setSelected(null);
    setStepIndex(0);
    spokenMilestones.current.clear();
    arrivalSpoken.current = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setStatus(position ? 'GPS ενεργό' : 'Περιμένω GPS…');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>LUMINA</Text>
            <Text style={styles.title}>DRIVE</Text>
          </View>
          <Pressable style={styles.settingsButton} onPress={() => setSettingsOpen(true)}>
            <Text style={styles.settingsButtonText}>☰</Text>
          </Pressable>
        </View>

        {route ? (
          <View style={[styles.turnBanner, navigationActive && styles.turnBannerActive]}>
            <Text style={styles.turnEyebrow}>{navigationActive ? 'ΚΑΘΟΔΗΓΗΣΗ ΕΝΕΡΓΗ' : 'ΔΙΑΔΡΟΜΗ ΕΤΟΙΜΗ'}</Text>
            <Text style={styles.turnDestination}>{selected?.name}</Text>
            <Text style={styles.turnInstruction}>{activeInstruction}</Text>
            <Text style={styles.turnMeta}>
              {navigationActive && distanceToNextManeuver != null ? `${fmtDistance(distanceToNextManeuver)} ως την επόμενη κίνηση  •  ` : ''}
              {fmtDistance(route.distance)}  •  {fmtDuration(route.duration)}
            </Text>
            {!navigationActive ? (
              <Pressable style={styles.beginButton} onPress={beginGuidance}>
                <Text style={styles.beginButtonText}>▶ ΕΝΑΡΞΗ ΚΑΘΟΔΗΓΗΣΗΣ</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.stopButton} onPress={stopNavigation}>
                <Text style={styles.stopButtonText}>✕ ΤΕΡΜΑΤΙΣΜΟΣ</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {!navigationActive ? (
          <>
            <View style={styles.dashboardCard}>
              <View style={styles.speedPanel}>
                <Text style={styles.speedNumber}>{speedKmh}</Text>
                <Text style={styles.speedUnit}>km/h</Text>
              </View>
              <View style={styles.gpsPanel}>
                <Text style={styles.gpsValue}>{position ? '● GPS CONNECTED' : '○ GPS WAITING'}</Text>
                <Text style={styles.gpsMeta}>
                  {position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}${accuracy ? `  •  ±${Math.round(accuracy)}m` : ''}` : gpsError || 'Αναμονή θέσης'}
                </Text>
              </View>
              <Pressable style={styles.centerButton} onPress={() => setCenterNonce((n) => n + 1)}>
                <Text style={styles.centerButtonText}>◎</Text>
              </Pressable>
            </View>

            <View style={styles.searchCard}>
              <Text style={styles.sectionKicker}>DESTINATION · ΟΛΗ Η ΕΛΛΑΔΑ</Text>
              <View style={styles.searchRow}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Όνομα ή διεύθυνση…"
                  placeholderTextColor="#6f7785"
                  style={styles.searchInput}
                  returnKeyType="search"
                  onSubmitEditing={() => searchMapbox(query, false)}
                />
                <Pressable style={styles.searchButton} onPress={() => searchMapbox(query, false)}>
                  <Text style={styles.searchButtonText}>⌕</Text>
                </Pressable>
              </View>
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
                    searchMapbox(item[0], true);
                  }}
                >
                  <Text style={styles.categoryText}>{item[1]}</Text>
                </Pressable>
              )}
            />

            <View style={styles.statusBox}>
              {loading || routeLoading ? <ActivityIndicator /> : <View style={styles.statusDot} />}
              <Text style={styles.statusText}>{status}</Text>
            </View>

            {items.length > 0 ? (
              <View style={styles.resultsBlock}>
                <Text style={styles.resultsTitle}>{items.length} αποτελέσματα</Text>
                {items.map((item, index) => (
                  <Pressable key={item.id} style={styles.resultCard} onPress={() => calculateRoute(item)}>
                    <View style={styles.resultIndex}><Text style={styles.resultIndexText}>{index + 1}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultTitle}>{item.name}</Text>
                      <Text style={styles.resultMeta}>{position ? `${fmtDistance(item.distance)}  •  ` : ''}{item.address}</Text>
                    </View>
                    <Text style={styles.routeArrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        <View style={[styles.mapFrame, navigationActive && styles.mapFrameNavigation]}>
          <View style={styles.mapTopBar}>
            <Text style={styles.mapTopText}>{navigationActive ? 'LIVE NAVIGATION' : 'MAP'}</Text>
            <Text style={styles.mapTopRight}>{navigationActive ? `${speedKmh} km/h` : 'MAPBOX GL'}</Text>
          </View>
          <View style={styles.mapWrap}>
            {token ? (
              <WebMap token={token} position={position} route={route} selected={selected} navigationActive={navigationActive} centerNonce={centerNonce} />
            ) : (
              <Pressable style={styles.mapPlaceholder} onPress={() => setSettingsOpen(true)}>
                <Text style={styles.mapPlaceholderTitle}>Mapbox token δεν έχει οριστεί</Text>
                <Text style={styles.mapPlaceholderText}>Πάτησε εδώ για να προσθέσεις public token.</Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={settingsOpen} transparent animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalKicker}>SYSTEM SETTINGS</Text>
            <Text style={styles.modalTitle}>Mapbox access</Text>
            <Text style={styles.modalText}>{token ? 'Public token αποθηκευμένο σε αυτή τη συσκευή.' : 'Δεν υπάρχει αποθηκευμένο Mapbox token.'}</Text>
            <TextInput
              secureTextEntry
              autoCapitalize="none"
              value={tokenDraft}
              onChangeText={setTokenDraft}
              placeholder="Mapbox public token (pk....)"
              placeholderTextColor="#6f7785"
              style={styles.modalInput}
            />
            <Pressable style={styles.modalSave} onPress={saveToken}>
              <Text style={styles.modalSaveText}>ΑΠΟΘΗΚΕΥΣΗ TOKEN</Text>
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
  screen: { padding: 18, paddingBottom: 42, gap: 16, maxWidth: 980, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  eyebrow: { color: '#8894a6', fontSize: 12, fontWeight: '800', letterSpacing: 4 },
  title: { color: '#f5f7fb', fontSize: 30, fontWeight: '900', letterSpacing: 3 },
  settingsButton: { width: 48, height: 48, borderRadius: 18, backgroundColor: '#111720', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#263241' },
  settingsButtonText: { color: '#e0b968', fontSize: 24 },
  dashboardCard: { backgroundColor: '#0d131b', borderWidth: 1, borderColor: '#263241', borderRadius: 28, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 20 },
  speedPanel: { width: 110, alignItems: 'center', borderRightWidth: 1, borderRightColor: '#263241' },
  speedNumber: { color: '#f5f7fb', fontSize: 54, fontWeight: '300' },
  speedUnit: { color: '#8a95a5', fontWeight: '700', letterSpacing: 2 },
  gpsPanel: { flex: 1 },
  gpsValue: { color: '#f2f5f8', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  gpsMeta: { color: '#7d8797', marginTop: 8, fontSize: 13 },
  centerButton: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#111a25', borderWidth: 1, borderColor: '#29384a', alignItems: 'center', justifyContent: 'center' },
  centerButtonText: { color: '#73c7ff', fontSize: 26 },
  searchCard: { backgroundColor: '#0d131b', borderWidth: 1, borderColor: '#263241', borderRadius: 26, padding: 18 },
  sectionKicker: { color: '#808c9e', fontSize: 12, fontWeight: '900', letterSpacing: 2.5, marginBottom: 12 },
  searchRow: { flexDirection: 'row', gap: 10 },
  searchInput: { flex: 1, minHeight: 58, borderRadius: 18, backgroundColor: '#090d13', borderWidth: 1, borderColor: '#263241', color: '#f3f5f7', paddingHorizontal: 16, fontSize: 18 },
  searchButton: { width: 62, borderRadius: 18, backgroundColor: '#e0b968', alignItems: 'center', justifyContent: 'center' },
  searchButtonText: { color: '#101319', fontSize: 30 },
  categoriesList: { flexGrow: 0 },
  categories: { gap: 10 },
  category: { paddingHorizontal: 18, paddingVertical: 13, borderRadius: 20, backgroundColor: '#101720', borderWidth: 1, borderColor: '#263241' },
  categoryActive: { borderColor: '#e0b968' },
  categoryText: { color: '#d9dee6', fontWeight: '700', fontSize: 15 },
  statusBox: { minHeight: 56, borderRadius: 18, backgroundColor: '#0d131b', borderWidth: 1, borderColor: '#263241', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#39d6b4' },
  statusText: { flex: 1, color: '#aab4c2' },
  resultsBlock: { gap: 10 },
  resultsTitle: { color: '#f0f3f6', fontSize: 17, fontWeight: '800' },
  resultCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#0d131b', borderWidth: 1, borderColor: '#263241', borderRadius: 18, padding: 14 },
  resultIndex: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#17202c', alignItems: 'center', justifyContent: 'center' },
  resultIndexText: { color: '#e0b968', fontWeight: '900' },
  resultTitle: { color: '#eef2f6', fontWeight: '800', fontSize: 16 },
  resultMeta: { color: '#7f8998', marginTop: 4 },
  routeArrow: { color: '#73c7ff', fontSize: 30 },
  mapFrame: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: '#263241', backgroundColor: '#0b1118' },
  mapFrameNavigation: { minHeight: 620 },
  mapTopBar: { height: 52, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0c1219' },
  mapTopText: { color: '#8591a2', fontWeight: '900', letterSpacing: 2 },
  mapTopRight: { color: '#e0b968', fontWeight: '900', letterSpacing: 1.5 },
  mapWrap: { minHeight: 430, backgroundColor: '#071019' },
  map: { width: '100%', height: 520 },
  mapPlaceholder: { minHeight: 430, alignItems: 'center', justifyContent: 'center', padding: 28 },
  mapPlaceholderTitle: { color: '#f4f6f8', fontSize: 22, fontWeight: '900', textAlign: 'center' },
  mapPlaceholderText: { color: '#7f8998', marginTop: 12, textAlign: 'center', fontSize: 16 },
  turnBanner: { borderRadius: 24, backgroundColor: '#101720', borderWidth: 1, borderColor: '#34506a', padding: 18 },
  turnBannerActive: { borderColor: '#73c7ff' },
  turnEyebrow: { color: '#73c7ff', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  turnDestination: { color: '#f3f6f8', fontSize: 22, fontWeight: '900', marginTop: 5 },
  turnInstruction: { color: '#f0f3f6', fontSize: 19, marginTop: 8 },
  turnMeta: { color: '#93a0b0', marginTop: 8 },
  beginButton: { marginTop: 14, backgroundColor: '#e0b968', padding: 14, borderRadius: 15, alignItems: 'center' },
  beginButtonText: { color: '#101319', fontWeight: '900' },
  stopButton: { marginTop: 12, backgroundColor: '#2a1418', padding: 12, borderRadius: 14, alignItems: 'center' },
  stopButtonText: { color: '#ff7f8e', fontWeight: '900' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.68)' },
  modalCard: { backgroundColor: '#101720', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, borderWidth: 1, borderColor: '#2a3544' },
  modalKicker: { color: '#8792a2', fontWeight: '900', letterSpacing: 2 },
  modalTitle: { color: '#f3f5f7', fontSize: 24, fontWeight: '900', marginTop: 6 },
  modalText: { color: '#9ba6b6', marginTop: 8, marginBottom: 14 },
  modalInput: { minHeight: 56, borderRadius: 16, backgroundColor: '#090d13', borderWidth: 1, borderColor: '#2a3544', color: '#f3f5f7', paddingHorizontal: 14 },
  modalSave: { marginTop: 12, backgroundColor: '#e0b968', padding: 15, borderRadius: 15, alignItems: 'center' },
  modalSaveText: { color: '#101319', fontWeight: '900' },
  modalClose: { marginTop: 10, padding: 14, alignItems: 'center' },
  modalCloseText: { color: '#aab4c2', fontWeight: '700' },
});
