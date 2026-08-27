import AsyncStorage from '@react-native-async-storage/async-storage';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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
type Poi = { id: string; name: string; address: string; point: Point; distance: number; score?: number };
type RouteStep = { instruction: string; point: Point; distance: number; duration: number };
type RouteInfo = { geometry: any; distance: number; duration: number; steps: RouteStep[] };

const TOKEN_KEY = 'lumina-mapbox-public-token';
const GEOCODE_API = 'https://api.mapbox.com/search/geocode/v6/forward';
const SEARCHBOX_API = 'https://api.mapbox.com/search/searchbox/v1/forward';
const DIRECTIONS_API = 'https://api.mapbox.com/directions/v5/mapbox/driving';
const GREECE_BBOX = '19.2477,34.7006,29.7297,41.7489';

const categories = [
  ['restaurant', '🍽️ Εστιατόρια'],
  ['cafe', '☕ Καφέ'],
  ['fast food', '🌯 Fast food'],
  ['pharmacy', '💊 Φαρμακεία'],
  ['gas station', '⛽ Βενζίνη'],
  ['hotel', '🏨 Ξενοδοχεία'],
  ['supermarket', '🛒 Supermarket'],
  ['gym', '🏋️ Γυμναστήρια'],
] as const;

function toRad(v: number) { return (v * Math.PI) / 180; }
function distanceMeters(a: Point, b: Point) {
  const R = 6371e3;
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dp = toRad(b.lat - a.lat);
  const dl = toRad(b.lng - a.lng);
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function fmtDistance(m: number) { return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`; }
function fmtDuration(sec: number) {
  const min = Math.max(1, Math.round(sec / 60));
  return min < 60 ? `${min} λεπ` : `${Math.floor(min / 60)} ω ${min % 60} λεπ`;
}
function speakGreek(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'el-GR';
  u.rate = 0.94;
  window.speechSynthesis.speak(u);
}
function normalizeGreek(v: string) {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('el-GR')
    .replace(/ς/g, 'σ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
function queryScore(query: string, name: string, address: string) {
  const q = normalizeGreek(query);
  const hay = normalizeGreek(`${name} ${address}`);
  if (!q) return 0;
  const tokens = q.split(/\s+/).filter((x) => x.length >= 2);
  let score = hay.includes(q) ? 100 : 0;
  for (const token of tokens) if (hay.includes(token)) score += token.length >= 4 ? 16 : 8;
  const last = tokens.at(-1);
  if (last && last.length >= 3 && hay.includes(last)) score += 40;
  return score;
}
function featureToPoi(feature: any, i: number, position: Point | null): Poi | null {
  const c = feature?.geometry?.coordinates;
  const p = feature?.properties || {};
  if (!Array.isArray(c) || c.length < 2) return null;
  const point = { lng: Number(c[0]), lat: Number(c[1]) };
  if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat)) return null;
  const name = String(p.name || p.full_address || feature?.place_name || 'Αποτέλεσμα');
  const address = String(p.full_address || p.place_formatted || p.address || feature?.place_name || name);
  return {
    id: String(feature.id || `${name}-${i}-${point.lng}-${point.lat}`),
    name,
    address,
    point,
    distance: position ? distanceMeters(position, point) : 0,
  };
}

function WebMap({ position, route, selected, navigationActive, centerNonce }: {
  position: Point | null;
  route: RouteInfo | null;
  selected: Poi | null;
  navigationActive: boolean;
  centerNonce: number;
}) {
  const hostRef = useRef<any>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarker = useRef<L.CircleMarker | null>(null);
  const destMarker = useRef<L.CircleMarker | null>(null);
  const routeLayer = useRef<L.Polyline | null>(null);

  useEffect(() => {
    const node = hostRef.current as HTMLElement | null;
    if (!node || mapRef.current) return;

    const map = L.map(node, { zoomControl: true, attributionControl: true }).setView(
      position ? [position.lat, position.lng] : [37.9838, 23.7275],
      position ? 16 : 6,
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      subdomains: ['a', 'b', 'c'],
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    mapRef.current = map;
    const timer = window.setTimeout(() => map.invalidateSize(), 300);
    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      userMarker.current = null;
      destMarker.current = null;
      routeLayer.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;
    if (!userMarker.current) {
      userMarker.current = L.circleMarker([position.lat, position.lng], {
        radius: 9,
        color: '#ffffff',
        weight: 3,
        fillColor: '#39d6b4',
        fillOpacity: 1,
      }).addTo(map);
      map.setView([position.lat, position.lng], 16, { animate: false });
    } else {
      userMarker.current.setLatLng([position.lat, position.lng]);
    }
    if (navigationActive) map.setView([position.lat, position.lng], 17, { animate: true });
  }, [position, navigationActive]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && position) map.setView([position.lat, position.lng], 16, { animate: true });
  }, [centerNonce]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeLayer.current) {
      routeLayer.current.remove();
      routeLayer.current = null;
    }
    if (!route) return;
    const coords = route.geometry.geometry.coordinates as [number, number][];
    const latLngs = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
    routeLayer.current = L.polyline(latLngs, {
      color: '#3b82f6',
      weight: navigationActive ? 9 : 7,
      opacity: 0.95,
    }).addTo(map);
    if (latLngs.length && !navigationActive) map.fitBounds(routeLayer.current.getBounds(), { padding: [40, 40] });
  }, [route, navigationActive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (destMarker.current) {
      destMarker.current.remove();
      destMarker.current = null;
    }
    if (!selected) return;
    destMarker.current = L.circleMarker([selected.point.lat, selected.point.lng], {
      radius: 9,
      color: '#ffffff',
      weight: 3,
      fillColor: '#e0b968',
      fillOpacity: 1,
    }).addTo(map);
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
  const [status, setStatus] = useState('Περιμένω GPS…');
  const [searchStatus, setSearchStatus] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Poi[]>([]);
  const [selected, setSelected] = useState<Poi | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultMode, setResultMode] = useState<'address' | 'category'>('address');
  const [navigationActive, setNavigationActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [centerNonce, setCenterNonce] = useState(0);
  const [nearbyOpen, setNearbyOpen] = useState(true);
  const spoken = useRef<Set<string>>(new Set());
  const searchSeq = useRef(0);

  useEffect(() => { AsyncStorage.getItem(TOKEN_KEY).then((v) => v?.startsWith('pk.') && setToken(v)); }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('Ο browser δεν υποστηρίζει GPS.');
      setStatus('GPS unavailable');
      return;
    }
    const ok = (p: GeolocationPosition) => {
      setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
      setAccuracy(p.coords.accuracy || null);
      setSpeedKmh(Math.max(0, Math.round((p.coords.speed || 0) * 3.6)));
      setGpsError('');
      setStatus('GPS ενεργό');
    };
    const fail = (e: GeolocationPositionError) => { setGpsError(e.message); setStatus('GPS unavailable'); };
    navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 });
    const id = navigator.geolocation.watchPosition(ok, fail, { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 });
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    if (!navigationActive || !position || !route) return;
    const step = route.steps[stepIndex];
    if (!step) return;
    const d = distanceMeters(position, step.point);
    const threshold = d <= 50 ? 50 : d <= 100 ? 100 : d <= 300 ? 300 : null;
    if (threshold) {
      const key = `${stepIndex}:${threshold}`;
      if (!spoken.current.has(key)) {
        spoken.current.add(key);
        speakGreek(`Σε ${threshold} μέτρα, ${step.instruction}`);
      }
    }
    if (d < 35 && stepIndex < route.steps.length - 1) setStepIndex((i) => i + 1);
  }, [navigationActive, position, route, stepIndex]);

  useEffect(() => {
    if (!token || navigationActive) return;
    const text = query.trim();
    if (text.length < 3) {
      setItems([]);
      return;
    }
    const timer = window.setTimeout(() => searchAddress(text, true), 320);
    return () => window.clearTimeout(timer);
  }, [query, token, navigationActive]);

  const nextInstruction = useMemo(() => route?.steps[stepIndex]?.instruction || '', [route, stepIndex]);
  const nextDistance = useMemo(() => {
    const step = route?.steps[stepIndex];
    return step && position ? distanceMeters(position, step.point) : null;
  }, [route, position, stepIndex]);

  async function saveToken() {
    const v = tokenDraft.trim();
    if (!v.startsWith('pk.')) { setStatus('Το token πρέπει να αρχίζει από pk.'); return; }
    await AsyncStorage.setItem(TOKEN_KEY, v);
    setToken(v);
    setTokenDraft('');
    setSettingsOpen(false);
    setStatus('Mapbox token αποθηκεύτηκε.');
  }

  async function requestGeocode(url: URL) {
    const r = await fetch(url.toString());
    const data = await r.json();
    if (!r.ok) throw new Error(data?.message || `HTTP ${r.status}`);
    return Array.isArray(data?.features) ? data.features : [];
  }

  async function searchAddress(text: string, autocomplete = false) {
    if (!token) { setSettingsOpen(true); setStatus('Χρειάζεται Mapbox token'); return; }
    const q = text.trim();
    if (!q) return;
    const seq = ++searchSeq.current;
    setResultMode('address');
    setLoading(true);
    setRoute(null);
    setSelected(null);
    setNavigationActive(false);
    try {
      const url = new URL(GEOCODE_API);
      url.searchParams.set('q', q);
      url.searchParams.set('access_token', token);
      url.searchParams.set('country', 'GR');
      url.searchParams.set('language', 'el');
      url.searchParams.set('autocomplete', autocomplete ? 'true' : 'false');
      url.searchParams.set('limit', '10');
      url.searchParams.set('types', 'address,street,place,locality');
      url.searchParams.set('bbox', GREECE_BBOX);
      if (position) url.searchParams.set('proximity', `${position.lng},${position.lat}`);

      const requests: Promise<any[]>[] = [requestGeocode(url)];
      const parts = q.split(/\s+/).filter(Boolean);
      const placeHint = parts.at(-1) || '';
      const normalizedHint = normalizeGreek(placeHint);
      const hintLooksLikePlace = parts.length >= 2 && normalizedHint.length >= 3 && /^\p{L}+$/u.test(placeHint);

      if (hintLooksLikePlace) {
        const nationwide = new URL(GEOCODE_API);
        nationwide.searchParams.set('q', q);
        nationwide.searchParams.set('access_token', token);
        nationwide.searchParams.set('country', 'GR');
        nationwide.searchParams.set('language', 'el');
        nationwide.searchParams.set('autocomplete', autocomplete ? 'true' : 'false');
        nationwide.searchParams.set('limit', '10');
        nationwide.searchParams.set('types', 'address,street,place,locality');
        nationwide.searchParams.set('bbox', GREECE_BBOX);
        requests.push(requestGeocode(nationwide).catch(() => []));
      }

      if (parts.length >= 3) {
        const addressLine = parts.slice(0, -1).join(' ');
        if (hintLooksLikePlace && addressLine.length >= 4) {
          const structured = new URL(GEOCODE_API);
          structured.searchParams.set('address_line1', addressLine);
          structured.searchParams.set('place', placeHint);
          structured.searchParams.set('country', 'GR');
          structured.searchParams.set('language', 'el');
          structured.searchParams.set('autocomplete', autocomplete ? 'true' : 'false');
          structured.searchParams.set('limit', '10');
          structured.searchParams.set('bbox', GREECE_BBOX);
          structured.searchParams.set('access_token', token);
          requests.push(requestGeocode(structured).catch(() => []));
        }
      }

      const batches = await Promise.all(requests);
      if (seq !== searchSeq.current) return;
      const seen = new Set<string>();
      let parsed = batches.flat().map((f, i) => featureToPoi(f, i, position)).filter(Boolean) as Poi[];
      parsed = parsed.filter((p) => {
        const key = `${p.point.lng.toFixed(5)}:${p.point.lat.toFixed(5)}:${normalizeGreek(p.name)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      parsed.forEach((p) => { p.score = queryScore(q, p.name, p.address); });

      const normalizedQueryTokens = normalizeGreek(q)
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !/^\d+$/.test(token));

      if (normalizedQueryTokens.length) {
        const strictMatches = parsed.filter((p) => {
          const hay = normalizeGreek(`${p.name} ${p.address}`);
          return normalizedQueryTokens.every((token) => hay.includes(token));
        });
        parsed = strictMatches;
      }

      parsed.sort((a, b) => {
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (scoreDiff) return scoreDiff;
        return a.distance - b.distance;
      });
      parsed = parsed.slice(0, 10);
      setItems(parsed);
      setSearchStatus(parsed.length ? `${parsed.length} προτάσεις` : 'Δεν βρέθηκε σχετική διεύθυνση.');
    } catch (e: any) {
      if (seq === searchSeq.current) setSearchStatus(`Αναζήτηση: ${e?.message || e}`);
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }

  async function searchCategory(text: string) {
    if (!token) { setSettingsOpen(true); setStatus('Χρειάζεται Mapbox token'); return; }
    setResultMode('category');
    setLoading(true);
    setRoute(null);
    setSelected(null);
    setNavigationActive(false);
    try {
      const url = new URL(SEARCHBOX_API);
      url.searchParams.set('q', text);
      url.searchParams.set('access_token', token);
      url.searchParams.set('country', 'GR');
      url.searchParams.set('language', 'el');
      url.searchParams.set('limit', '10');
      if (position) url.searchParams.set('proximity', `${position.lng},${position.lat}`);
      const r = await fetch(url.toString());
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || `HTTP ${r.status}`);
      let parsed = (data.features || []).map((f: any, i: number) => featureToPoi(f, i, position)).filter(Boolean) as Poi[];
      if (position) parsed = parsed.filter((p) => p.distance <= 25000).sort((a, b) => a.distance - b.distance);
      setItems(parsed);
      setSearchStatus(parsed.length ? `${parsed.length} κοντινά σημεία` : 'Δεν βρέθηκαν κοντινά σημεία.');
    } catch (e: any) { setSearchStatus(`Αναζήτηση: ${e?.message || e}`); }
    finally { setLoading(false); }
  }

  async function calculateRoute(poi: Poi) {
    if (!token || !position) { setStatus('Χρειάζεται Mapbox token και GPS.'); return; }
    ++searchSeq.current;
    setItems([]);
    setSearchStatus('');
    setLoading(true);
    setSelected(poi);
    setRoute(null);
    setNavigationActive(false);
    setStepIndex(0);
    spoken.current.clear();
    try {
      const url = new URL(`${DIRECTIONS_API}/${position.lng},${position.lat};${poi.point.lng},${poi.point.lat}`);
      url.searchParams.set('access_token', token);
      url.searchParams.set('geometries', 'geojson');
      url.searchParams.set('overview', 'full');
      url.searchParams.set('steps', 'true');
      url.searchParams.set('language', 'el');
      const r = await fetch(url.toString());
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || `HTTP ${r.status}`);
      const first = data.routes?.[0];
      if (!first?.geometry?.coordinates?.length) throw new Error('Δεν βρέθηκε διαδρομή.');
      const steps: RouteStep[] = (first.legs?.[0]?.steps || []).map((s: any) => ({
        instruction: String(s?.maneuver?.instruction || 'Συνέχισε'),
        point: { lng: Number(s?.maneuver?.location?.[0]), lat: Number(s?.maneuver?.location?.[1]) },
        distance: Number(s?.distance || 0),
        duration: Number(s?.duration || 0),
      }));
      setRoute({
        geometry: { type: 'Feature', properties: {}, geometry: first.geometry },
        distance: Number(first.distance || 0),
        duration: Number(first.duration || 0),
        steps,
      });
      setStatus(`Διαδρομή έτοιμη προς ${poi.name}`);
    } catch (e: any) { setStatus(`Διαδρομή: ${e?.message || e}`); }
    finally { setLoading(false); }
  }

  function beginGuidance() {
    if (!route || !selected) return;
    setNavigationActive(true);
    setStepIndex(0);
    spoken.current.clear();
    setStatus(`Καθοδήγηση ενεργή προς ${selected.name}`);
    speakGreek(`Η καθοδήγηση ξεκίνησε προς ${selected.name}`);
  }

  function stopGuidance() {
    setNavigationActive(false);
    setRoute(null);
    setSelected(null);
    setStepIndex(0);
    spoken.current.clear();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setStatus('GPS ενεργό');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>LUMINA</Text><Text style={styles.title}>DRIVE</Text></View>
          <Pressable style={styles.settings} onPress={() => setSettingsOpen(true)}><Text style={styles.settingsText}>☰</Text></Pressable>
        </View>

        <View style={styles.dashboard}>
          <View><Text style={styles.speed}>{speedKmh}</Text><Text style={styles.unit}>km/h</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.gps}>{position ? '● GPS CONNECTED' : '○ GPS WAITING'}</Text><Text style={styles.meta}>{position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}${accuracy ? ` · ±${Math.round(accuracy)}m` : ''}` : gpsError}</Text></View>
          <Pressable style={styles.center} onPress={() => setCenterNonce((n) => n + 1)}><Text style={styles.centerText}>◎</Text></Pressable>
        </View>

        {route ? <View style={styles.banner}><Text style={styles.bannerKicker}>{navigationActive ? 'ΚΑΘΟΔΗΓΗΣΗ ΕΝΕΡΓΗ' : 'ΔΙΑΔΡΟΜΗ ΕΤΟΙΜΗ'}</Text><Text style={styles.bannerTitle}>{selected?.name}</Text><Text style={styles.bannerText}>{navigationActive && nextDistance != null ? `${fmtDistance(nextDistance)} · ` : ''}{nextInstruction}</Text><Text style={styles.meta}>{fmtDistance(route.distance)} · {fmtDuration(route.duration)}</Text>{navigationActive ? <Pressable style={styles.stop} onPress={stopGuidance}><Text style={styles.stopText}>✕ ΤΕΡΜΑΤΙΣΜΟΣ</Text></Pressable> : <Pressable style={styles.go} onPress={beginGuidance}><Text style={styles.goText}>▶ ΕΝΑΡΞΗ ΚΑΘΟΔΗΓΗΣΗΣ</Text></Pressable>}</View> : null}

        {!navigationActive && <>
          <View style={styles.searchCard}>
            <Text style={styles.kicker}>DESTINATION · ΟΛΗ Η ΕΛΛΑΔΑ</Text>
            <View style={styles.searchRow}>
              <TextInput value={query} onChangeText={setQuery} placeholder="Όνομα ή διεύθυνση…" placeholderTextColor="#6f7785" style={styles.input} onSubmitEditing={() => searchAddress(query, false)} />
              <Pressable style={styles.searchButton} onPress={() => searchAddress(query, false)}><Text style={styles.searchButtonText}>⌕</Text></Pressable>
            </View>
            {resultMode === 'address' && query.trim().length >= 3 && (loading || items.length > 0) ? (
              <View style={styles.suggestions}>
                {loading && items.length === 0 ? <View style={styles.suggestionLoading}><ActivityIndicator /><Text style={styles.statusText}>Αναζήτηση…</Text></View> : null}
                {items.slice(0, 8).map((item) => (
                  <Pressable key={`suggest-${item.id}`} style={styles.suggestion} onPress={() => calculateRoute(item)}>
                    <View style={{ flex: 1 }}><Text style={styles.suggestionTitle}>{item.name}</Text><Text style={styles.suggestionMeta}>{item.address}</Text></View>
                    <Text style={styles.arrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {resultMode === 'address' && query.trim().length >= 3 && searchStatus ? <Text style={styles.searchFeedback}>{searchStatus}</Text> : null}
          </View>
          <FlatList horizontal data={categories} keyExtractor={(x) => x[0]} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} renderItem={({ item }) => <Pressable style={styles.category} onPress={() => searchCategory(item[0])}><Text style={styles.categoryText}>{item[1]}</Text></Pressable>} />
          <View style={styles.status}>{position ? <View style={styles.dot} /> : <ActivityIndicator />}<Text style={styles.statusText}>{position ? 'GPS ενεργό' : status}</Text></View>
          {resultMode === 'category' && items.length > 0 ? <View style={styles.nearby}><Pressable style={styles.nearbyToggle} onPress={() => setNearbyOpen((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: nearbyOpen }}><Text style={styles.resultTitle}>Κοντά μου · {items.length}</Text><Text style={styles.arrow}>{nearbyOpen ? '⌃' : '⌄'}</Text></Pressable>{nearbyOpen ? items.map((item) => <Pressable key={item.id} style={styles.result} onPress={() => calculateRoute(item)}><View style={{ flex: 1 }}><Text style={styles.resultTitle}>{item.name}</Text><Text style={styles.meta}>{position ? `${fmtDistance(item.distance)} · ` : ''}{item.address}</Text></View><Text style={styles.arrow}>›</Text></Pressable>) : null}</View> : null}
        </>}

        <View style={styles.mapFrame}>
          <View style={styles.mapTop}><Text style={styles.kicker}>MAP</Text><Text style={styles.mapEngine}>OPENSTREETMAP · MAPBOX ROUTING</Text></View>
          <WebMap position={position} route={route} selected={selected} navigationActive={navigationActive} centerNonce={centerNonce} />
        </View>
      </ScrollView>

      <Modal visible={settingsOpen} transparent animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <View style={styles.modalBackdrop}><View style={styles.modal}><Text style={styles.kicker}>MAPBOX ACCESS</Text><Text style={styles.modalTitle}>{token ? 'Token αποθηκευμένο' : 'Πρόσθεσε public token'}</Text><TextInput secureTextEntry autoCapitalize="none" value={tokenDraft} onChangeText={setTokenDraft} placeholder="pk...." placeholderTextColor="#6f7785" style={styles.input} /><Pressable style={styles.go} onPress={saveToken}><Text style={styles.goText}>ΑΠΟΘΗΚΕΥΣΗ TOKEN</Text></Pressable><Pressable style={styles.close} onPress={() => setSettingsOpen(false)}><Text style={styles.closeText}>Κλείσιμο</Text></Pressable></View></View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080b10' },
  screen: { width: '100%', maxWidth: 980, alignSelf: 'center', padding: 18, paddingBottom: 40, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#8894a6', fontWeight: '900', letterSpacing: 4, fontSize: 12 },
  title: { color: '#f5f7fb', fontWeight: '900', letterSpacing: 3, fontSize: 30 },
  settings: { width: 48, height: 48, borderRadius: 18, backgroundColor: '#111720', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#263241' },
  settingsText: { color: '#e0b968', fontSize: 24 },
  dashboard: { flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: '#0d131b', borderWidth: 1, borderColor: '#263241', borderRadius: 26, padding: 18 },
  speed: { color: '#f5f7fb', fontSize: 48, fontWeight: '300' },
  unit: { color: '#8a95a5', fontWeight: '700' },
  gps: { color: '#f2f5f8', fontWeight: '800', letterSpacing: 1.5 },
  meta: { color: '#7f8998', marginTop: 5 },
  center: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#111a25', alignItems: 'center', justifyContent: 'center' },
  centerText: { color: '#73c7ff', fontSize: 25 },
  searchCard: { backgroundColor: '#0d131b', borderWidth: 1, borderColor: '#263241', borderRadius: 26, padding: 18 },
  kicker: { color: '#8591a2', fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  searchRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  input: { flex: 1, minHeight: 56, borderRadius: 17, backgroundColor: '#090d13', borderWidth: 1, borderColor: '#263241', color: '#f3f5f7', paddingHorizontal: 15, fontSize: 17 },
  searchButton: { width: 60, borderRadius: 17, backgroundColor: '#e0b968', alignItems: 'center', justifyContent: 'center' },
  searchButtonText: { color: '#101319', fontSize: 29 },
  suggestions: { marginTop: 10, overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: '#263241', backgroundColor: '#090d13' },
  suggestion: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#1d2733' },
  suggestionLoading: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13 },
  suggestionTitle: { color: '#eef2f6', fontWeight: '800', fontSize: 15 },
  suggestionMeta: { color: '#7f8998', fontSize: 12, marginTop: 3 },
  searchFeedback: { color: '#7f8998', fontSize: 12, marginTop: 8, paddingHorizontal: 4 },
  category: { paddingHorizontal: 17, paddingVertical: 12, borderRadius: 19, backgroundColor: '#101720', borderWidth: 1, borderColor: '#263241' },
  categoryText: { color: '#d9dee6', fontWeight: '700' },
  status: { minHeight: 54, borderRadius: 18, backgroundColor: '#0d131b', borderWidth: 1, borderColor: '#263241', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#39d6b4' },
  statusText: { color: '#aab4c2', flex: 1 },
  result: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d131b', borderWidth: 1, borderColor: '#263241', borderRadius: 18, padding: 14 },
  nearby: { gap: 8 },
  nearbyToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  resultTitle: { color: '#eef2f6', fontWeight: '800', fontSize: 16 },
  arrow: { color: '#73c7ff', fontSize: 30 },
  banner: { backgroundColor: '#101720', borderWidth: 1, borderColor: '#34506a', borderRadius: 23, padding: 17 },
  bannerKicker: { color: '#73c7ff', fontWeight: '900', letterSpacing: 2, fontSize: 11 },
  bannerTitle: { color: '#f3f6f8', fontWeight: '900', fontSize: 22, marginTop: 5 },
  bannerText: { color: '#f0f3f6', fontSize: 18, marginTop: 7 },
  go: { marginTop: 12, backgroundColor: '#e0b968', padding: 14, borderRadius: 14, alignItems: 'center' },
  goText: { color: '#101319', fontWeight: '900' },
  stop: { marginTop: 12, backgroundColor: '#2a1418', padding: 13, borderRadius: 14, alignItems: 'center' },
  stopText: { color: '#ff7f8e', fontWeight: '900' },
  mapFrame: { overflow: 'hidden', borderRadius: 26, borderWidth: 1, borderColor: '#263241', backgroundColor: '#0b1118' },
  mapTop: { height: 52, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0c1219' },
  mapEngine: { color: '#e0b968', fontWeight: '900', fontSize: 11 },
  map: { width: '100%', height: 520 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.68)' },
  modal: { backgroundColor: '#101720', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, borderWidth: 1, borderColor: '#2a3544' },
  modalTitle: { color: '#f3f5f7', fontWeight: '900', fontSize: 24, marginVertical: 12 },
  close: { marginTop: 8, padding: 14, alignItems: 'center' },
  closeText: { color: '#aab4c2', fontWeight: '700' },
});
