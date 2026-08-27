from pathlib import Path

p = Path('app/index.web.tsx')
s = p.read_text()

s = s.replace(
    "  const [loading, setLoading] = useState(false);\n  const [navigationActive, setNavigationActive] = useState(false);",
    "  const [loading, setLoading] = useState(false);\n  const [resultMode, setResultMode] = useState<'address' | 'category'>('address');\n  const [navigationActive, setNavigationActive] = useState(false);",
    1,
)

s = s.replace(
    "    const seq = ++searchSeq.current;\n    setLoading(true);",
    "    const seq = ++searchSeq.current;\n    setResultMode('address');\n    setLoading(true);",
    1,
)

old = """      const requests: Promise<any[]>[] = [requestGeocode(url)];
      const parts = q.split(/\\s+/).filter(Boolean);
      if (parts.length >= 3) {
        const placeHint = parts.at(-1) || '';
        const addressLine = parts.slice(0, -1).join(' ');
        if (placeHint.length >= 2 && addressLine.length >= 4) {
          const structured = new URL(GEOCODE_API);
          structured.searchParams.set('address_line1', addressLine);
          structured.searchParams.set('place', placeHint);
          structured.searchParams.set('country', 'GR');
          structured.searchParams.set('language', 'el');
          structured.searchParams.set('autocomplete', autocomplete ? 'true' : 'false');
          structured.searchParams.set('limit', '10');
          structured.searchParams.set('bbox', GREECE_BBOX);
          structured.searchParams.set('access_token', token);
          if (position) structured.searchParams.set('proximity', `${position.lng},${position.lat}`);
          requests.push(requestGeocode(structured).catch(() => []));
        }
      }
"""
new = """      const requests: Promise<any[]>[] = [requestGeocode(url)];
      const parts = q.split(/\\s+/).filter(Boolean);
      const placeHint = parts.at(-1) || '';
      const normalizedHint = normalizeGreek(placeHint);
      const hintLooksLikePlace = parts.length >= 2 && normalizedHint.length >= 3 && /^\\p{L}+$/u.test(placeHint);

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
"""
if old not in s:
    raise SystemExit('search request target not found')
s = s.replace(old, new, 1)

s = s.replace(
    "  async function searchCategory(text: string) {\n    if (!token) { setSettingsOpen(true); setStatus('Χρειάζεται Mapbox token'); return; }\n    setLoading(true);",
    "  async function searchCategory(text: string) {\n    if (!token) { setSettingsOpen(true); setStatus('Χρειάζεται Mapbox token'); return; }\n    setResultMode('category');\n    setLoading(true);",
    1,
)

old = """            <View style={styles.searchRow}>
              <TextInput value={query} onChangeText={setQuery} placeholder=\"Όνομα ή διεύθυνση…\" placeholderTextColor=\"#6f7785\" style={styles.input} onSubmitEditing={() => searchAddress(query, false)} />
              <Pressable style={styles.searchButton} onPress={() => searchAddress(query, false)}><Text style={styles.searchButtonText}>⌕</Text></Pressable>
            </View>
          </View>
"""
new = """            <View style={styles.searchRow}>
              <TextInput value={query} onChangeText={setQuery} placeholder=\"Όνομα ή διεύθυνση…\" placeholderTextColor=\"#6f7785\" style={styles.input} onSubmitEditing={() => searchAddress(query, false)} />
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
          </View>
"""
if old not in s:
    raise SystemExit('search UI target not found')
s = s.replace(old, new, 1)

s = s.replace(
    "          {items.map((item) => <Pressable key={item.id} style={styles.result} onPress={() => calculateRoute(item)}><View style={{ flex: 1 }}><Text style={styles.resultTitle}>{item.name}</Text><Text style={styles.meta}>{position ? `${fmtDistance(item.distance)} · ` : ''}{item.address}</Text></View><Text style={styles.arrow}>›</Text></Pressable>)}",
    "          {resultMode === 'category' ? items.map((item) => <Pressable key={item.id} style={styles.result} onPress={() => calculateRoute(item)}><View style={{ flex: 1 }}><Text style={styles.resultTitle}>{item.name}</Text><Text style={styles.meta}>{position ? `${fmtDistance(item.distance)} · ` : ''}{item.address}</Text></View><Text style={styles.arrow}>›</Text></Pressable>) : null}",
    1,
)

s = s.replace(
    "  searchButtonText: { color: '#101319', fontSize: 29 },\n  category:",
    "  searchButtonText: { color: '#101319', fontSize: 29 },\n  suggestions: { marginTop: 10, overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: '#263241', backgroundColor: '#090d13' },\n  suggestion: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#1d2733' },\n  suggestionLoading: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13 },\n  suggestionTitle: { color: '#eef2f6', fontWeight: '800', fontSize: 15 },\n  suggestionMeta: { color: '#7f8998', fontSize: 12, marginTop: 3 },\n  category:",
    1,
)

p.write_text(s)
print('PROGRESSIVE AUTOCOMPLETE PATCH APPLIED')
