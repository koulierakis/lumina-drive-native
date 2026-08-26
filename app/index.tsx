import AsyncStorage from '@react-native-async-storage/async-storage';
import Mapbox from '@rnmapbox/maps';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
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

function speakGreek(message: string) {
  Speech.stop();
  Speech.speak(message, {
    language: 'el-GR',
    rate: 0.94,
    pitch: 1.0,
  });
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
  const camera = useRef<Mapbox.Camera>(null);
  const spokenMilestones = useRef<Set<string>>(new Set());
  const arrivalSpoken = useRef(false);

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
      setSpeedKmh(Math.max(0, Math.round((current.coords.speed ?? 0) * 3.6)));
      setStatus('GPS ενεργό');
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 3000 },
        (loc) => {
          setPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          setAccuracy(loc.coords.accuracy ?? null);
          setSpeedKmh(Math.max(0, Math.round((loc.coords.speed ?? 0) * 3.6)));
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
    spokenMilestones.current.clear();
    arrivalSpoken.current = false;
    Speech.stop();
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
    spokenMilestones.current.clear();
    arrivalSpoken.current = false;
    setNavigationActive(true);
    setStepIndex(0);
    setStatus(`Καθοδήγηση ενεργή προς ${selected.name}`);
    speakGreek(`Η καθοδήγηση ξεκίνησε προς ${selected.name}`);
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
    spokenMilestones.current.clear();
    arrivalSpoken.current = false;
    Speech.stop();
    setStatus('GPS ενεργό');
    if (center) {
      camera.current?.setCamera({ centerCoordinate: center, zoomLevel: 15, pitch: 0, animationDuration: 500 });
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>L</Text></View>
            <View>
              <Text style={styles.eyebrow}>LUMINA</Text>
              <Text style={styles.title}>DRIVE</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
            <Pressable style={styles.headerButton} onPress={() => setSettingsOpen(true)}>
              <Text style={styles.headerButtonText}>☰</Text>
            </Pressable>
          </View>
        </View>

        {route ? (
          <View style={[styles.turnBanner, navigationActive && styles.turnBannerActive]}>
            <View style={styles.turnIconWrap}><Text style={styles.turnIcon}>↗</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.turnEyebrow}>{navigationActive ? 'ΚΑΘΟΔΗΓΗΣΗ ΕΝΕΡΓΗ' : 'ΔΙΑΔΡΟΜΗ ΕΤΟΙΜΗ'}</Text>
              <Text style={styles.turnDestination} numberOfLines={1}>{selected?.name}</Text>
              <Text style={styles.turnInstruction}>{activeInstruction}</Text>
              <Text style={styles.turnMeta}>
                {navigationActive && distanceToNextManeuver != null
                  ? `${fmtDistance(distanceToNextManeuver)} ως την επόμενη κίνηση  •  `
                  : ''}
                {fmtDistance(route.distance)}  •  {fmtDuration(route.duration)}
              </Text>
              {!navigationActive ? (
                <Pressable style={styles.beginButton} onPress={beginGuidance}>
                  <Text style={styles.beginButtonText}>▶  ΕΝΑΡΞΗ ΚΑΘΟΔΗΓΗΣΗΣ</Text>
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
            <View style={styles.dashboardCard}>
              <View style={styles.speedPanel}>
                <Text style={styles.speedNumber}>{speedKmh}</Text>
                <Text style={styles.speedUnit}>km/h</Text>
              </View>
              <View style={styles.dashboardDivider} />
              <View style={styles.gpsPanel}>
                <View style={styles.gpsStatusRow}>
                  <View style={[styles.gpsDot, !position && styles.gpsDotOff]} />
                  <Text style={styles.gpsValue}>{position ? 'GPS CONNECTED' : 'GPS WAITING'}</Text>
                </View>
                <Text style={styles.gpsMeta} numberOfLines={1}>
                  {position
                    ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}${accuracy ? `  •  ±${Math.round(accuracy)}m` : ''}`
                    : gpsError || 'Αναμονή πραγματικής θέσης'}
                </Text>
              </View>
              <Pressable
                style={styles.centerButton}
                onPress={() => center && camera.current?.setCamera({ centerCoordinate: center, zoomLevel: 15, animationDuration: 500 })}
              >
                <Text style={styles.centerButtonText}>◎</Text>
              </Pressable>
            </View>

            <View style={styles.searchCard}>
              <Text style={styles.sectionKicker}>DESTINATION</Text>
              <View style={styles.searchRow}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Αναζήτηση προορισμού…"
                  placeholderTextColor="#6f7785"
                  style={styles.searchInput}
                  returnKeyType="search"
                  onSubmitEditing={() => searchMapbox(query)}
                />
                <Pressable style={styles.searchButton} onPress={() => searchMapbox(query)}>
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
                    searchMapbox(item[0]);
                  }}
                >
                  <Text style={[styles.categoryText, lastCategory === item[0] && styles.categoryTextActive]} numberOfLines={1}>{item[1]}</Text>
                </Pressable>
              )}
            />

            <View style={styles.statusBox}>
              {loading || routeLoading ? <ActivityIndicator /> : <View style={styles.statusDot} />}
              <Text style={styles.statusText}>{status}</Text>
            </View>

            {items.length > 0 ? (
              <View style={styles.resultsBlock}>
                <View style={styles.resultsHeader}>
                  <Text style={styles.resultsTitle}>Κοντινά σημεία</Text>
                  <Text style={styles.resultsCount}>{items.length} RESULTS</Text>
                </View>
                {items.map((item, index) => (
                  <Pressable key={item.id} style={styles.resultCard} onPress={() => calculateRoute(item)}>
                    <View style={styles.resultIndex}><Text style={styles.resultIndexText}>{index + 1}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultTitle} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.resultMeta} numberOfLines={2}>{fmtDistance(item.distance)}  •  {item.address}</Text>
                    </View>
                    <View style={styles.routeArrow}><Text style={styles.startText}>›</Text></View>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        <View style={[styles.mapFrame, navigationActive && styles.mapFrameNavigation]}>
          <View style={styles.mapTopBar}>
            <Text style={styles.mapTopText}>{navigationActive ? 'LIVE NAVIGATION' : 'MAP'}</Text>
            <Text style={styles.mapTopRight}>{navigationActive ? `${speedKmh} km/h` : 'MAPBOX'}</Text>
          </View>
          <View style={[styles.mapWrap, navigationActive && styles.mapWrapNavigation]}>
            {token ? (
              <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Street}>
                <Mapbox.Camera ref={camera} zoomLevel={13} centerCoordinate={center} />
                {position ? <Mapbox.LocationPuck puckBearingEnabled pulsing={{ isEnabled: true }} /> : null}
                {route ? (
                  <Mapbox.ShapeSource id="navigation-route" shape={route.geometry}>
                    <Mapbox.LineLayer
                      id="navigation-route-line"
                      style={{ lineColor: '#73C7FF', lineWidth: navigationActive ? 9 : 7, lineCap: 'round', lineJoin: 'round' }}
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
                <Text style={styles.mapPlaceholderText}>Πάτησε εδώ για να προσθέσεις public token.</Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={settingsOpen} transparent animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalKicker}>SYSTEM SETTINGS</Text>
            <Text style={styles.modalTitle}>Mapbox access</Text>
            <Text style={styles.modalText}>
              {token ? 'Public token αποθηκευμένο σε αυτή τη συσκευή.' : 'Δεν υπάρχει αποθηκευμένο Mapbox token.'}
            </Text>
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
  safe: { flex: 1, backgroundColor: '#05070B' },
  screen: { paddingBottom: 32 },
  header: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#D8B66B', alignItems: 'center', justifyContent: 'center', shadowColor: '#D8B66B', shadowOpacity: 0.24, shadowRadius: 12, elevation: 4 },
  brandMarkText: { color: '#070A0F', fontSize: 20, fontWeight: '900' },
  eyebrow: { color: '#8E98A8', letterSpacing: 4.5, fontSize: 10, fontWeight: '800' },
  title: { color: '#F7F8FA', fontSize: 24, fontWeight: '900', marginTop: 1, letterSpacing: 1.2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  livePill: { minHeight: 34, paddingHorizontal: 11, borderRadius: 12, backgroundColor: '#0E141C', borderWidth: 1, borderColor: '#1C2632', flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#55E6B8' },
  liveText: { color: '#AEB8C5', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  headerButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#0E141C', borderWidth: 1, borderColor: '#1C2632', alignItems: 'center', justifyContent: 'center' },
  headerButtonText: { color: '#E8EBEF', fontSize: 21, fontWeight: '700' },

  dashboardCard: { marginHorizontal: 16, marginBottom: 14, minHeight: 112, borderRadius: 24, backgroundColor: '#0B1017', borderWidth: 1, borderColor: '#1B2530', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  speedPanel: { width: 78, alignItems: 'center', justifyContent: 'center' },
  speedNumber: { color: '#F8FAFC', fontSize: 40, fontWeight: '300', letterSpacing: -1.5 },
  speedUnit: { color: '#6F7B8A', fontSize: 11, fontWeight: '800', letterSpacing: 1.3, marginTop: -2 },
  dashboardDivider: { width: 1, height: 58, backgroundColor: '#202A36', marginHorizontal: 15 },
  gpsPanel: { flex: 1 },
  gpsStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  gpsDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#55E6B8' },
  gpsDotOff: { backgroundColor: '#7B8491' },
  gpsValue: { color: '#D7DEE7', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  gpsMeta: { color: '#747F8D', fontSize: 12, marginTop: 7 },
  centerButton: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#111A24', borderWidth: 1, borderColor: '#263443', alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  centerButtonText: { color: '#78C9FF', fontSize: 23, fontWeight: '900' },

  searchCard: { marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 22, backgroundColor: '#0B1017', borderWidth: 1, borderColor: '#1B2530' },
  sectionKicker: { color: '#697482', fontSize: 10, fontWeight: '900', letterSpacing: 1.8, marginBottom: 9 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1, backgroundColor: '#070B10', borderWidth: 1, borderColor: '#1B2530', color: '#F4F6F8', borderRadius: 16, paddingHorizontal: 14, minHeight: 50, fontSize: 16 },
  searchButton: { width: 52, minHeight: 50, backgroundColor: '#D8B66B', borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  searchButtonText: { color: '#070A0F', fontSize: 27, fontWeight: '500', marginTop: -2 },

  categoriesList: { marginBottom: 11 },
  categories: { paddingHorizontal: 16, gap: 8 },
  category: { backgroundColor: '#0C1219', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#1A2430' },
  categoryActive: { borderColor: '#D8B66B', backgroundColor: '#19170F' },
  categoryText: { color: '#AEB7C3', fontSize: 14, fontWeight: '700' },
  categoryTextActive: { color: '#F0D79C' },

  statusBox: { marginHorizontal: 16, marginBottom: 15, paddingHorizontal: 13, minHeight: 44, borderRadius: 15, backgroundColor: '#090E14', borderWidth: 1, borderColor: '#18212B', flexDirection: 'row', alignItems: 'center', gap: 9 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#55E6B8' },
  statusText: { color: '#98A3B1', fontSize: 13, flex: 1 },

  resultsBlock: { marginHorizontal: 16, marginBottom: 14 },
  resultsHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 },
  resultsTitle: { color: '#F7F8FA', fontSize: 21, fontWeight: '800' },
  resultsCount: { color: '#687483', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, paddingBottom: 3 },
  resultCard: { minHeight: 76, backgroundColor: '#0B1017', borderWidth: 1, borderColor: '#1B2530', borderRadius: 19, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  resultIndex: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#121A24', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  resultIndexText: { color: '#D8B66B', fontSize: 13, fontWeight: '900' },
  resultTitle: { color: '#F4F6F8', fontSize: 16, fontWeight: '800' },
  resultMeta: { color: '#7D8896', fontSize: 13, marginTop: 4, lineHeight: 18 },
  routeArrow: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#111A24', alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  startText: { color: '#78C9FF', fontSize: 28, fontWeight: '400', marginTop: -2 },

  turnBanner: { marginHorizontal: 16, marginBottom: 14, padding: 15, backgroundColor: '#0A111A', borderRadius: 23, flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: '#264158' },
  turnBannerActive: { backgroundColor: '#071511', borderColor: '#2C6C59' },
  turnIconWrap: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#101D29', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  turnIcon: { color: '#78C9FF', fontSize: 25, fontWeight: '800' },
  turnEyebrow: { color: '#6D7A88', fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  turnDestination: { color: '#D8B66B', fontSize: 13, fontWeight: '800', marginTop: 4 },
  turnInstruction: { color: '#F7F8FA', fontSize: 20, fontWeight: '800', marginTop: 7, lineHeight: 25 },
  turnMeta: { color: '#8D99A8', fontSize: 13, marginTop: 7, fontWeight: '600' },
  beginButton: { marginTop: 13, minHeight: 49, borderRadius: 15, backgroundColor: '#D8B66B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  beginButtonText: { color: '#070A0F', fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },
  stopButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#121A22', borderWidth: 1, borderColor: '#26323E', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  stopButtonText: { color: '#E6EAF0', fontSize: 17, fontWeight: '800' },

  mapFrame: { marginHorizontal: 16, borderRadius: 25, overflow: 'hidden', borderWidth: 1, borderColor: '#1D2834', backgroundColor: '#090E14' },
  mapFrameNavigation: { borderColor: '#2C6C59' },
  mapTopBar: { height: 38, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#090E14' },
  mapTopText: { color: '#798593', fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  mapTopRight: { color: '#D8B66B', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  mapWrap: { height: 390, overflow: 'hidden', backgroundColor: '#0A1017' },
  mapWrapNavigation: { height: 610 },
  map: { flex: 1 },
  mapPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  mapPlaceholderTitle: { color: '#F4F6F8', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  mapPlaceholderText: { color: '#788392', fontSize: 14, textAlign: 'center', marginTop: 8 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#0B1017', borderTopWidth: 1, borderColor: '#1D2834', padding: 22, paddingBottom: 34, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  modalHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: '#2A3440', alignSelf: 'center', marginBottom: 20 },
  modalKicker: { color: '#697482', fontSize: 9, fontWeight: '900', letterSpacing: 1.8 },
  modalTitle: { color: '#F7F8FA', fontSize: 23, fontWeight: '800', marginTop: 5 },
  modalText: { color: '#84909E', marginTop: 8, marginBottom: 15, lineHeight: 20 },
  modalInput: { backgroundColor: '#070B10', color: '#F4F6F8', borderRadius: 16, minHeight: 52, paddingHorizontal: 14, borderWidth: 1, borderColor: '#1D2834' },
  modalSave: { backgroundColor: '#D8B66B', borderRadius: 16, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  modalSaveText: { color: '#070A0F', fontWeight: '900', fontSize: 13, letterSpacing: 0.8 },
  modalClose: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  modalCloseText: { color: '#9BA6B4', fontWeight: '700' },
});