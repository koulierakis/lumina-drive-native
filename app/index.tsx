import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
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
import { MapLibreMapSurface } from './v2/maplibre-map-surface';

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
  geometry: { type: 'LineString'; coordinates: number[][] };
  distance: number;
  duration: number;
  instruction: string;
  steps: RouteStep[];
};

const TOKEN_KEY = 'lumina-mapbox-public-token';
const NAVIGATION_SESSION_KEY = 'lumina-navigation-session';
const VOICE_PREFERENCE_KEY = 'lumina-navigation-voice';
const SEARCH_API = 'https://api.mapbox.com/search/searchbox/v1/forward';
const DIRECTIONS_API = 'https://api.mapbox.com/directions/v5/mapbox/driving';
const VOICE_THRESHOLDS = [300, 100, 50] as const;
const FALLBACK_CENTER: Point = { lat: 39.5553, lng: 21.7679 };
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

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(a: Point, b: Point) {
  const radius = 6371e3;
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dp = toRad(b.lat - a.lat);
  const dl = toRad(b.lng - a.lng);
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function fmtDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function fmtDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} λεπ`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ω ${rest} λεπ` : `${hours} ω`;
}

function speakGreek(message: string) {
  Speech.stop();
  Speech.speak(message, { language: 'el-GR', rate: 0.94, pitch: 1.0 });
}

function actionFirstInstruction(instruction: string) {
  const value = instruction.toLocaleLowerCase('el-GR');
  if (value.includes('κυκλ') || value.includes('roundabout')) {
    const exit = instruction.match(/(\d+)\s*(?:η|η έξοδο|exit)/i)?.[1];
    return exit ? `ΚΥΚΛΙΚΟΣ ΚΟΜΒΟΣ · ${exit}η ΕΞΟΔΟΣ` : 'ΚΥΚΛΙΚΟΣ ΚΟΜΒΟΣ';
  }
  if (value.includes('αριστερ')) return 'ΣΤΡΟΦΗ ΑΡΙΣΤΕΡΑ';
  if (value.includes('δεξι')) return 'ΣΤΡΟΦΗ ΔΕΞΙΑ';
  if (value.includes('αναστροφ')) return 'ΚΑΝΕΤΕ ΑΝΑΣΤΡΟΦΗ';
  if (value.includes('κρατ') || value.includes('συγχων')) return instruction.toUpperCase();
  return 'ΣΥΝΕΧΙΣΤΕ ΕΥΘΕΙΑ';
}

export default function HomeScreen() {
  const [token, setToken] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [position, setPosition] = useState<Point | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [heading, setHeading] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [loading, setLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [status, setStatus] = useState('Περιμένω GPS…');
  const [items, setItems] = useState<Poi[]>([]);
  const [selected, setSelected] = useState<Poi | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [navigationActive, setNavigationActive] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [lastCategory, setLastCategory] = useState('');
  const spokenMilestones = useRef<Set<string>>(new Set());
  const arrivalSpoken = useRef(false);
  const navigationSnapshot = useRef({
    active: false,
    route: null as RouteInfo | null,
    selected: null as Poi | null,
    stepIndex: 0,
    voiceEnabled: true,
  });

  useEffect(() => {
    AsyncStorage.getItem(TOKEN_KEY).then((saved) => {
      if (saved?.startsWith('pk.')) setToken(saved);
    });
    AsyncStorage.getItem(VOICE_PREFERENCE_KEY).then((saved) => setVoiceEnabled(saved !== 'off'));
    AsyncStorage.getItem(NAVIGATION_SESSION_KEY).then((saved) => {
      if (!saved) return;
      try {
        const session = JSON.parse(saved);
        if (session?.active && session.route && session.selected) {
          setRoute(session.route);
          setSelected(session.selected);
          setStepIndex(Math.max(0, Number(session.stepIndex) || 0));
          setNavigationActive(true);
        }
      } catch {}
    });
  }, []);

  useEffect(() => {
    navigationSnapshot.current = { active: navigationActive, route, selected, stepIndex, voiceEnabled };
    AsyncStorage.setItem(VOICE_PREFERENCE_KEY, voiceEnabled ? 'on' : 'off');
    if (navigationActive && route && selected) {
      AsyncStorage.setItem(
        NAVIGATION_SESSION_KEY,
        JSON.stringify({ active: true, route, selected, stepIndex, voiceEnabled, savedAt: Date.now() }),
      );
    }
  }, [navigationActive, route, selected, stepIndex, voiceEnabled]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'background' && state !== 'inactive') return;
      const snapshot = navigationSnapshot.current;
      if (snapshot.active && snapshot.route && snapshot.selected) {
        AsyncStorage.setItem(NAVIGATION_SESSION_KEY, JSON.stringify({ ...snapshot, savedAt: Date.now() }));
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let subscription: Location.LocationSubscription | undefined;
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
      setSpeedKmh(Math.max(0, Math.round((current.coords.speed ?? 0) * 3.6)));
      setHeading(Number.isFinite(current.coords.heading) ? current.coords.heading : null);
      setStatus('GPS ενεργό');
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 3000 },
        (location) => {
          setPosition({ lat: location.coords.latitude, lng: location.coords.longitude });
          setAccuracy(location.coords.accuracy ?? null);
          setSpeedKmh(Math.max(0, Math.round((location.coords.speed ?? 0) * 3.6)));
          setHeading(Number.isFinite(location.coords.heading) ? location.coords.heading : null);
          setGpsError('');
        },
      );
    })().catch((error) => {
      setGpsError(String(error?.message || error));
      setStatus('GPS unavailable');
    });
    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    if (!navigationActive || !position || !route) return;
    const currentStep = route.steps[stepIndex];
    if (currentStep) {
      const meters = distanceMeters(position, currentStep.point);
      const threshold = meters <= 50 ? 50 : meters <= 100 ? 100 : meters <= 300 ? 300 : null;
      if (threshold != null) {
        const key = `${stepIndex}:${threshold}`;
        if (!spokenMilestones.current.has(key)) {
          for (const passed of VOICE_THRESHOLDS) {
            if (passed >= threshold) spokenMilestones.current.add(`${stepIndex}:${passed}`);
          }
          if (voiceEnabled) speakGreek(`Σε ${threshold} μέτρα, ${actionFirstInstruction(currentStep.instruction).toLocaleLowerCase('el-GR')}.`);
        }
      }
      if (meters < 35 && stepIndex < route.steps.length - 1) {
        setStepIndex((value) => Math.min(value + 1, route.steps.length - 1));
      }
    }
    if (selected && distanceMeters(position, selected.point) < 30) {
      setStatus(`Έφτασες στο ${selected.name}`);
      if (!arrivalSpoken.current) {
        arrivalSpoken.current = true;
        if (voiceEnabled) speakGreek(`Έφτασες στον προορισμό σου, ${selected.name}`);
      }
    }
  }, [navigationActive, position, route, selected, stepIndex, voiceEnabled]);

  const mapCenter = position ?? FALLBACK_CENTER;
  const routePoints = useMemo<Point[]>(
    () => route?.geometry.coordinates.map(([lng, lat]) => ({ lng, lat })) ?? [],
    [route],
  );
  const activeInstruction = route?.steps[stepIndex]?.instruction || route?.instruction || '';
  const distanceToNextManeuver = useMemo(() => {
    if (!route || !position) return null;
    const step = route.steps[stepIndex];
    return step ? distanceMeters(position, step.point) : null;
  }, [position, route, stepIndex]);

  async function saveToken() {
    const value = tokenDraft.trim();
    if (!value.startsWith('pk.')) {
      Alert.alert('Mapbox token', 'Χρειάζεται public token που αρχίζει από pk.');
      return;
    }
    await AsyncStorage.setItem(TOKEN_KEY, value);
    setToken(value);
    setTokenDraft('');
    setSettingsOpen(false);
  }

  function resetRouteState() {
    setItems([]);
    setSelected(null);
    setRoute(null);
    setNavigationActive(false);
    setStepIndex(0);
    spokenMilestones.current.clear();
    arrivalSpoken.current = false;
    Speech.stop();
  }

  async function searchMapbox(text: string) {
    if (!token) {
      setSettingsOpen(true);
      setStatus('Χρειάζεται Mapbox token για online αναζήτηση');
      return;
    }
    if (!position) {
      setStatus('Περιμένω πραγματική θέση GPS…');
      return;
    }
    const q = text.trim();
    if (!q) return;
    setLoading(true);
    resetRouteState();
    setStatus(`Αναζήτηση “${q}”…`);
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
      const data = raw ? JSON.parse(raw) : {};
      if (!response.ok) throw new Error(`Search HTTP ${response.status}: ${data?.message || 'error'}`);
      const parsed: Poi[] = (data.features || [])
        .map((feature: any, index: number) => {
          const coords = feature?.geometry?.coordinates;
          const properties = feature?.properties || {};
          if (!Array.isArray(coords) || coords.length < 2 || !properties.name) return null;
          const point = { lat: Number(coords[1]), lng: Number(coords[0]) };
          if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
          return {
            id: String(feature.id || `${properties.name}-${index}`),
            name: String(properties.name),
            address: String(properties.full_address || properties.place_formatted || properties.address || '—'),
            category: String(properties.poi_category?.[0] || properties.maki || q),
            point,
            distance: distanceMeters(position, point),
          } satisfies Poi;
        })
        .filter(Boolean)
        .filter((item: Poi) => item.distance <= 10000)
        .sort((a: Poi, b: Poi) => a.distance - b.distance);
      setItems(parsed);
      setStatus(parsed.length ? `${parsed.length} αποτελέσματα · κοντινότερο πρώτο` : 'Δεν βρέθηκαν κοντινά σημεία.');
    } catch (error: any) {
      setStatus(String(error?.message || error));
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
    spokenMilestones.current.clear();
    arrivalSpoken.current = false;
    Speech.stop();
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
      const data = raw ? JSON.parse(raw) : {};
      if (!response.ok) throw new Error(`Directions HTTP ${response.status}: ${data?.message || 'error'}`);
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
          } satisfies RouteStep;
        })
        .filter(Boolean);
      const info: RouteInfo = {
        geometry: { type: 'LineString', coordinates: coords },
        distance: Number(first.distance || 0),
        duration: Number(first.duration || 0),
        instruction: steps[0]?.instruction || `Πορεία προς ${poi.name}`,
        steps,
      };
      setRoute(info);
      setStatus(`Διαδρομή έτοιμη προς ${poi.name}`);
    } catch (error: any) {
      setStatus(String(error?.message || error));
      Alert.alert('Πλοήγηση', String(error?.message || error));
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
    if (voiceEnabled) speakGreek(`Η καθοδήγηση ξεκίνησε προς ${selected.name}`);
  }

  function stopNavigation() {
    setNavigationActive(false);
    setRoute(null);
    setSelected(null);
    setStepIndex(0);
    spokenMilestones.current.clear();
    arrivalSpoken.current = false;
    Speech.stop();
    AsyncStorage.removeItem(NAVIGATION_SESSION_KEY);
    setStatus('GPS ενεργό');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>LUMINA</Text><Text style={styles.title}>DRIVE</Text></View>
          <Pressable style={styles.headerButton} onPress={() => setSettingsOpen(true)}><Text style={styles.headerButtonText}>☰</Text></Pressable>
        </View>

        <View style={styles.dashboardCard}>
          <View><Text style={styles.speedNumber}>{speedKmh}</Text><Text style={styles.speedUnit}>km/h</Text></View>
          <View style={styles.gpsPanel}>
            <Text style={styles.gpsValue}>{position ? 'GPS CONNECTED' : 'GPS WAITING'}</Text>
            <Text style={styles.gpsMeta}>{position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}${accuracy ? ` · ±${Math.round(accuracy)}m` : ''}` : gpsError || 'Αναμονή θέσης'}</Text>
          </View>
        </View>

        {route ? (
          <View style={[styles.turnBanner, navigationActive && styles.turnBannerActive]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.turnEyebrow}>{navigationActive ? 'ΚΑΘΟΔΗΓΗΣΗ ΕΝΕΡΓΗ' : 'ΔΙΑΔΡΟΜΗ ΕΤΟΙΜΗ'}</Text>
              <Text style={styles.turnDestination}>{selected?.name}</Text>
              <Text style={styles.turnInstruction}>{navigationActive && distanceToNextManeuver != null ? `${fmtDistance(distanceToNextManeuver)} — ${actionFirstInstruction(activeInstruction)}` : activeInstruction}</Text>
              <Text style={styles.turnMeta}>{fmtDistance(route.distance)} · {fmtDuration(route.duration)}</Text>
              {!navigationActive ? <Pressable style={styles.beginButton} onPress={beginGuidance}><Text style={styles.beginButtonText}>▶ ΕΝΑΡΞΗ ΚΑΘΟΔΗΓΗΣΗΣ</Text></Pressable> : null}
              {navigationActive ? <Pressable style={styles.voiceButton} onPress={() => setVoiceEnabled((value) => !value)}><Text style={styles.voiceButtonText}>{voiceEnabled ? '🔊' : '🔇'} ΦΩΝΗ</Text></Pressable> : null}
            </View>
            <Pressable style={styles.stopButton} onPress={stopNavigation}><Text style={styles.stopButtonText}>✕</Text></Pressable>
          </View>
        ) : null}

        {!navigationActive ? (
          <>
            <View style={styles.searchCard}>
              <Text style={styles.sectionKicker}>DESTINATION</Text>
              <View style={styles.searchRow}>
                <TextInput value={query} onChangeText={setQuery} placeholder="Αναζήτηση προορισμού…" placeholderTextColor="#6f7785" style={styles.searchInput} returnKeyType="search" onSubmitEditing={() => searchMapbox(query)} />
                <Pressable style={styles.searchButton} onPress={() => searchMapbox(query)}><Text style={styles.searchButtonText}>⌕</Text></Pressable>
              </View>
            </View>
            <FlatList horizontal data={categories} keyExtractor={(item) => item[0]} showsHorizontalScrollIndicator={false} style={styles.categoriesList} contentContainerStyle={styles.categories} renderItem={({ item }) => (
              <Pressable style={[styles.category, lastCategory === item[0] && styles.categoryActive]} onPress={() => { setLastCategory(item[0]); searchMapbox(item[0]); }}>
                <Text style={styles.categoryText}>{item[1]}</Text>
              </Pressable>
            )} />
            <View style={styles.statusBox}>{loading || routeLoading ? <ActivityIndicator /> : <View style={styles.statusDot} />}<Text style={styles.statusText}>{status}</Text></View>
            {items.length > 0 ? <View style={styles.resultsBlock}>{items.map((item, index) => (
              <Pressable key={item.id} style={styles.resultCard} onPress={() => calculateRoute(item)}>
                <Text style={styles.resultIndex}>{index + 1}</Text>
                <View style={{ flex: 1 }}><Text style={styles.resultTitle}>{item.name}</Text><Text style={styles.resultMeta}>{fmtDistance(item.distance)} · {item.address}</Text></View>
                <Text style={styles.routeArrow}>›</Text>
              </Pressable>
            ))}</View> : null}
          </>
        ) : null}

        <View style={[styles.mapFrame, navigationActive && styles.mapFrameNavigation]}>
          <View style={styles.mapTopBar}><Text style={styles.mapTopText}>{navigationActive ? 'LIVE NAVIGATION' : 'MAP'}</Text><Text style={styles.mapTopRight}>MAPLIBRE · OSM</Text></View>
          <View style={[styles.mapWrap, navigationActive && styles.mapWrapNavigation]}>
            <MapLibreMapSurface
              center={mapCenter}
              route={routePoints}
              destination={selected?.point}
              zoom={navigationActive ? 16.2 : 14}
              bearing={navigationActive ? heading ?? 0 : 0}
              pitch={navigationActive ? 48 : 0}
              navigationActive={navigationActive}
              trackUserLocation={Boolean(position)}
            />
          </View>
        </View>
      </ScrollView>

      <Modal visible={settingsOpen} transparent animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard}>
          <Text style={styles.modalKicker}>ONLINE FALLBACK</Text>
          <Text style={styles.modalTitle}>Mapbox Search & Routing</Text>
          <Text style={styles.modalText}>Ο χάρτης είναι πλέον MapLibre/OpenStreetMap. Το token χρησιμοποιείται μόνο για online αναζήτηση και διαδρομές μέχρι να ενεργοποιηθεί το πλήρες offline routing.</Text>
          <TextInput secureTextEntry autoCapitalize="none" value={tokenDraft} onChangeText={setTokenDraft} placeholder="Mapbox public token (pk....)" placeholderTextColor="#6f7785" style={styles.modalInput} />
          <Pressable style={styles.modalSave} onPress={saveToken}><Text style={styles.modalSaveText}>ΑΠΟΘΗΚΕΥΣΗ TOKEN</Text></Pressable>
          <Pressable style={styles.modalClose} onPress={() => setSettingsOpen(false)}><Text style={styles.modalCloseText}>Κλείσιμο</Text></Pressable>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#05070B' },
  screen: { paddingBottom: 32 },
  header: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#8E98A8', letterSpacing: 4.5, fontSize: 10, fontWeight: '800' },
  title: { color: '#F7F8FA', fontSize: 24, fontWeight: '900', letterSpacing: 1.2 },
  headerButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#0E141C', borderWidth: 1, borderColor: '#1C2632', alignItems: 'center', justifyContent: 'center' },
  headerButtonText: { color: '#E8EBEF', fontSize: 21, fontWeight: '700' },
  dashboardCard: { marginHorizontal: 16, marginBottom: 14, minHeight: 100, borderRadius: 24, backgroundColor: '#0B1017', borderWidth: 1, borderColor: '#1B2530', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 24 },
  speedNumber: { color: '#F8FAFC', fontSize: 40, fontWeight: '300' },
  speedUnit: { color: '#6F7B8A', fontSize: 11, fontWeight: '800' },
  gpsPanel: { flex: 1 },
  gpsValue: { color: '#D7DEE7', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  gpsMeta: { color: '#747F8D', fontSize: 12, marginTop: 7 },
  searchCard: { marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 22, backgroundColor: '#0B1017', borderWidth: 1, borderColor: '#1B2530' },
  sectionKicker: { color: '#697482', fontSize: 10, fontWeight: '900', letterSpacing: 1.8, marginBottom: 9 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1, backgroundColor: '#070B10', borderWidth: 1, borderColor: '#1B2530', color: '#F4F6F8', borderRadius: 16, paddingHorizontal: 14, minHeight: 50, fontSize: 16 },
  searchButton: { width: 52, minHeight: 50, backgroundColor: '#D8B66B', borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  searchButtonText: { color: '#070A0F', fontSize: 27 },
  categoriesList: { marginBottom: 11 },
  categories: { paddingHorizontal: 16, gap: 8 },
  category: { backgroundColor: '#0C1219', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#1A2430' },
  categoryActive: { borderColor: '#D8B66B', backgroundColor: '#19170F' },
  categoryText: { color: '#AEB7C3', fontSize: 14, fontWeight: '700' },
  statusBox: { marginHorizontal: 16, marginBottom: 15, paddingHorizontal: 13, minHeight: 44, borderRadius: 15, backgroundColor: '#090E14', borderWidth: 1, borderColor: '#18212B', flexDirection: 'row', alignItems: 'center', gap: 9 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#55E6B8' },
  statusText: { color: '#98A3B1', fontSize: 13, flex: 1 },
  resultsBlock: { marginHorizontal: 16, marginBottom: 14 },
  resultCard: { minHeight: 72, backgroundColor: '#0B1017', borderWidth: 1, borderColor: '#1B2530', borderRadius: 19, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultIndex: { color: '#D8B66B', fontWeight: '900', width: 22, textAlign: 'center' },
  resultTitle: { color: '#F4F6F8', fontSize: 16, fontWeight: '800' },
  resultMeta: { color: '#7D8896', fontSize: 13, marginTop: 4 },
  routeArrow: { color: '#78C9FF', fontSize: 28 },
  turnBanner: { marginHorizontal: 16, marginBottom: 14, padding: 15, backgroundColor: '#0A111A', borderRadius: 23, flexDirection: 'row', borderWidth: 1, borderColor: '#264158' },
  turnBannerActive: { backgroundColor: '#071511', borderColor: '#2C6C59' },
  turnEyebrow: { color: '#6D7A88', fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  turnDestination: { color: '#D8B66B', fontSize: 13, fontWeight: '800', marginTop: 4 },
  turnInstruction: { color: '#F7F8FA', fontSize: 20, fontWeight: '800', marginTop: 7, lineHeight: 25 },
  turnMeta: { color: '#8D99A8', fontSize: 13, marginTop: 7, fontWeight: '600' },
  beginButton: { marginTop: 13, minHeight: 49, borderRadius: 15, backgroundColor: '#D8B66B', alignItems: 'center', justifyContent: 'center' },
  beginButtonText: { color: '#070A0F', fontSize: 13, fontWeight: '900' },
  voiceButton: { marginTop: 10, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#111A24', justifyContent: 'center' },
  voiceButtonText: { color: '#D7DEE7', fontSize: 13, fontWeight: '800' },
  stopButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#121A22', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  stopButtonText: { color: '#E6EAF0', fontSize: 17, fontWeight: '800' },
  mapFrame: { marginHorizontal: 16, borderRadius: 25, overflow: 'hidden', borderWidth: 1, borderColor: '#1D2834', backgroundColor: '#090E14' },
  mapFrameNavigation: { borderColor: '#2C6C59' },
  mapTopBar: { height: 38, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#090E14' },
  mapTopText: { color: '#798593', fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  mapTopRight: { color: '#D8B66B', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  mapWrap: { height: 390, overflow: 'hidden', backgroundColor: '#0A1017' },
  mapWrapNavigation: { height: 610 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#0B1017', borderTopWidth: 1, borderColor: '#1D2834', padding: 22, paddingBottom: 34, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  modalKicker: { color: '#697482', fontSize: 9, fontWeight: '900', letterSpacing: 1.8 },
  modalTitle: { color: '#F7F8FA', fontSize: 23, fontWeight: '800', marginTop: 5 },
  modalText: { color: '#84909E', marginTop: 8, marginBottom: 15, lineHeight: 20 },
  modalInput: { backgroundColor: '#070B10', color: '#F4F6F8', borderRadius: 16, minHeight: 52, paddingHorizontal: 14, borderWidth: 1, borderColor: '#1D2834' },
  modalSave: { backgroundColor: '#D8B66B', borderRadius: 16, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  modalSaveText: { color: '#070A0F', fontWeight: '900', fontSize: 13 },
  modalClose: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  modalCloseText: { color: '#9BA6B4', fontWeight: '700' },
});