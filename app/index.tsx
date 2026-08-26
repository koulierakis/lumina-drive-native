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

const TOKEN_KEY = 'lumina-mapbox-public-token';
const SEARCH_API = 'https://api.mapbox.com/search/searchbox/v1/forward';
const categories = [
  ['restaurant', '🍽️ Εστιατόρια / Ταβέρνες'],
  ['cafe', '☕ Καφέ'],
  ['fast food', '🌯 Fast food'],
  ['hotel', '🏨 Ξενοδοχεία'],
  ['apartments', '🏠 Apartments / Studios'],
  ['pharmacy', '💊 Φαρμακεία'],
  ['gas station', '⛽ Βενζινάδικα'],
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

export default function HomeScreen() {
  const [token, setToken] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [position, setPosition] = useState<Point | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Περιμένω GPS…');
  const [items, setItems] = useState<Poi[]>([]);
  const [selected, setSelected] = useState<Poi | null>(null);
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
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setPosition({ lat: current.coords.latitude, lng: current.coords.longitude });
      setAccuracy(current.coords.accuracy ?? null);
      setStatus('GPS ενεργό');
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5,
          timeInterval: 3000,
        },
        (loc) => {
          setPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          setAccuracy(loc.coords.accuracy ?? null);
          setGpsError('');
          setStatus('GPS ενεργό');
        },
      );
    })().catch((e) => {
      setGpsError(String(e?.message || e));
      setStatus('GPS unavailable');
    });
    return () => sub?.remove();
  }, []);

  const center = useMemo<[number, number] | undefined>(
    () => (position ? [position.lng, position.lat] : undefined),
    [position],
  );

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
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      const raw = await response.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {}
      if (!response.ok) {
        throw new Error(`Mapbox HTTP ${response.status}: ${data?.message || raw || 'error'}`);
      }
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
      setStatus(
        parsed.length
          ? `Mapbox · ${parsed.length} πραγματικά αποτελέσματα · κοντινότερο πρώτο`
          : 'Το Mapbox απάντησε αλλά δεν βρήκε κοντινά σημεία.',
      );
    } catch (e: any) {
      setStatus(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  function selectPoi(poi: Poi) {
    setSelected(poi);
    camera.current?.setCamera({
      centerCoordinate: [poi.point.lng, poi.point.lat],
      zoomLevel: 15,
      animationDuration: 700,
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>LUMINA</Text>
          <Text style={styles.title}>Drive Assistant</Text>
        </View>
        <Pressable style={styles.headerButton} onPress={() => setSettingsOpen(true)}>
          <Text style={styles.headerButtonText}>☰</Text>
        </Pressable>
      </View>

      <View style={styles.gpsBar}>
        <View>
          <Text style={styles.gpsValue}>{position ? 'GPS ενεργό' : 'GPS αναμονή'}</Text>
          <Text style={styles.gpsMeta}>
            {position
              ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}${accuracy ? ` · ±${Math.round(accuracy)}m` : ''}`
              : gpsError || 'Αναμονή πραγματικής θέσης'}
          </Text>
        </View>
        <Pressable
          style={styles.centerButton}
          onPress={() =>
            center &&
            camera.current?.setCamera({
              centerCoordinate: center,
              zoomLevel: 15,
              animationDuration: 500,
            })
          }
        >
          <Text style={styles.centerButtonText}>◎</Text>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Αναζήτηση με όνομα ή διεύθυνση…"
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
        contentContainerStyle={styles.categories}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.category, lastCategory === item[0] && styles.categoryActive]}
            onPress={() => {
              setLastCategory(item[0]);
              searchMapbox(item[0]);
            }}
          >
            <Text style={styles.categoryText}>{item[1]}</Text>
          </Pressable>
        )}
      />

      <View style={styles.mapWrap}>
        {token ? (
          <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Street}>
            <Mapbox.Camera ref={camera} zoomLevel={13} centerCoordinate={center} />
            {position ? <Mapbox.LocationPuck puckBearingEnabled pulsing={{ isEnabled: true }} /> : null}
            {selected ? (
              <Mapbox.PointAnnotation
                id="selected-destination"
                coordinate={[selected.point.lng, selected.point.lat]}
              />
            ) : null}
          </Mapbox.MapView>
        ) : (
          <Pressable style={styles.mapPlaceholder} onPress={() => setSettingsOpen(true)}>
            <Text style={styles.mapPlaceholderTitle}>Mapbox token δεν έχει οριστεί</Text>
            <Text style={styles.mapPlaceholderText}>Πάτησε εδώ για να προσθέσεις public token (pk…).</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.statusBox}>
        {loading ? <ActivityIndicator /> : null}
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        style={styles.results}
        contentContainerStyle={styles.resultsContent}
        renderItem={({ item, index }) => (
          <Pressable style={styles.resultCard} onPress={() => selectPoi(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultTitle}>{index + 1}. {item.name}</Text>
              <Text style={styles.resultMeta}>{fmtDistance(item.distance)} · {item.address}</Text>
            </View>
            <Text style={styles.startText}>▶</Text>
          </Pressable>
        )}
      />

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
  header: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: { color: '#5ba8ff', letterSpacing: 5, fontSize: 12, fontWeight: '800' },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 2 },
  headerButton: { width: 52, height: 52, borderRadius: 18, backgroundColor: '#141b24', alignItems: 'center', justifyContent: 'center' },
  headerButtonText: { color: '#fff', fontSize: 24 },
  gpsBar: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 24,
    backgroundColor: '#161d27',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gpsValue: { color: '#5ce1d3', fontSize: 18, fontWeight: '800' },
  gpsMeta: { color: '#9ca7b7', marginTop: 4, fontSize: 12 },
  centerButton: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#218cff', alignItems: 'center', justifyContent: 'center' },
  centerButtonText: { color: '#fff', fontSize: 25, fontWeight: '800' },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  searchInput: { flex: 1, minHeight: 52, borderRadius: 17, backgroundColor: '#151b24', color: '#fff', paddingHorizontal: 14 },
  searchButton: { paddingHorizontal: 16, borderRadius: 17, backgroundColor: '#218cff', alignItems: 'center', justifyContent: 'center' },
  searchButtonText: { color: '#fff', fontWeight: '800' },
  categories: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  category: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 15, backgroundColor: '#171e28' },
  categoryActive: { backgroundColor: '#213b5d' },
  categoryText: { color: '#fff', fontWeight: '700' },
  mapWrap: { height: 260, marginHorizontal: 16, borderRadius: 24, overflow: 'hidden', backgroundColor: '#111720' },
  map: { flex: 1 },
  mapPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  mapPlaceholderTitle: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  mapPlaceholderText: { color: '#9ca7b7', textAlign: 'center', marginTop: 8 },
  statusBox: { minHeight: 50, marginHorizontal: 16, marginTop: 10, borderRadius: 16, backgroundColor: '#111720', padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' },
  statusText: { color: '#cbd5e1', flex: 1 },
  results: { flex: 1 },
  resultsContent: { padding: 16, paddingBottom: 28, gap: 9 },
  resultCard: { minHeight: 74, borderRadius: 18, backgroundColor: '#171e28', padding: 14, flexDirection: 'row', alignItems: 'center' },
  resultTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  resultMeta: { color: '#9ca7b7', marginTop: 5 },
  startText: { color: '#4aa3ff', fontSize: 23, paddingLeft: 12 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.68)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#10161f', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34 },
  modalTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  modalText: { color: '#aab4c1', marginTop: 8, marginBottom: 14 },
  modalInput: { minHeight: 54, borderRadius: 16, backgroundColor: '#171e28', color: '#fff', paddingHorizontal: 14 },
  modalSave: { minHeight: 54, borderRadius: 16, backgroundColor: '#218cff', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  modalSaveText: { color: '#fff', fontWeight: '900', fontSize: 17 },
  modalClose: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  modalCloseText: { color: '#b8c2cf', fontWeight: '700' },
});
