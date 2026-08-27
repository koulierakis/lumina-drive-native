from pathlib import Path

p = Path('app/index.web.tsx')
s = p.read_text()

# Keep autocomplete from re-running every time GPS coordinates update.
s = s.replace(
    "  }, [query, token, navigationActive, position?.lat, position?.lng]);",
    "  }, [query, token, navigationActive]);",
    1,
)

# Dedicated search feedback; the lower GPS status must remain GPS status.
if "const [searchStatus, setSearchStatus]" not in s:
    s = s.replace(
        "  const [status, setStatus] = useState('Περιμένω GPS…');\n  const [query, setQuery] = useState('');",
        "  const [status, setStatus] = useState('Περιμένω GPS…');\n  const [searchStatus, setSearchStatus] = useState('');\n  const [query, setQuery] = useState('');",
        1,
    )

s = s.replace(
    "      setStatus(parsed.length ? `${parsed.length} προτάσεις` : 'Δεν βρέθηκε σχετική διεύθυνση.');",
    "      setSearchStatus(parsed.length ? `${parsed.length} προτάσεις` : 'Δεν βρέθηκε σχετική διεύθυνση.');",
    1,
)
s = s.replace(
    "      if (seq === searchSeq.current) setStatus(`Αναζήτηση: ${e?.message || e}`);",
    "      if (seq === searchSeq.current) setSearchStatus(`Αναζήτηση: ${e?.message || e}`);",
    1,
)
s = s.replace(
    "      setStatus(parsed.length ? `${parsed.length} κοντινά σημεία` : 'Δεν βρέθηκαν κοντινά σημεία.');",
    "      setSearchStatus(parsed.length ? `${parsed.length} κοντινά σημεία` : 'Δεν βρέθηκαν κοντινά σημεία.');",
    1,
)
s = s.replace(
    "    } catch (e: any) { setStatus(`Αναζήτηση: ${e?.message || e}`); }",
    "    } catch (e: any) { setSearchStatus(`Αναζήτηση: ${e?.message || e}`); }",
    1,
)

# Selecting a suggestion invalidates any pending autocomplete request and hides the dropdown.
needle = "  async function calculateRoute(poi: Poi) {\n    if (!token || !position) { setStatus('Χρειάζεται Mapbox token και GPS.'); return; }\n    setLoading(true);"
replacement = "  async function calculateRoute(poi: Poi) {\n    if (!token || !position) { setStatus('Χρειάζεται Mapbox token και GPS.'); return; }\n    ++searchSeq.current;\n    setItems([]);\n    setSearchStatus('');\n    setLoading(true);"
if needle in s:
    s = s.replace(needle, replacement, 1)

# Show search feedback near search, while the lower row remains a true GPS state.
ui_needle = """            {resultMode === 'address' && query.trim().length >= 3 && (loading || items.length > 0) ? (\n              <View style={styles.suggestions}>"""
if ui_needle in s and "styles.searchFeedback" not in s:
    # append feedback after suggestion block by targeting the block terminator immediately before searchCard close
    target = """              </View>\n            ) : null}\n          </View>"""
    repl = """              </View>\n            ) : null}\n            {resultMode === 'address' && query.trim().length >= 3 && searchStatus ? <Text style={styles.searchFeedback}>{searchStatus}</Text> : null}\n          </View>"""
    s = s.replace(target, repl, 1)

s = s.replace(
    "          <View style={styles.status}>{loading ? <ActivityIndicator /> : <View style={styles.dot} />}<Text style={styles.statusText}>{status}</Text></View>",
    "          <View style={styles.status}>{position ? <View style={styles.dot} /> : <ActivityIndicator />}<Text style={styles.statusText}>{position ? 'GPS ενεργό' : status}</Text></View>",
    1,
)

if "searchFeedback:" not in s:
    s = s.replace(
        "  suggestionMeta: { color: '#7f8998', fontSize: 12, marginTop: 3 },\n  category:",
        "  suggestionMeta: { color: '#7f8998', fontSize: 12, marginTop: 3 },\n  searchFeedback: { color: '#7f8998', fontSize: 12, marginTop: 8, paddingHorizontal: 4 },\n  category:",
        1,
    )

p.write_text(s)
print('ROUTE + GPS STATUS FIX APPLIED')
