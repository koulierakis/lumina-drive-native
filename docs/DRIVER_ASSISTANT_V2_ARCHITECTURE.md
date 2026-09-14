# LUMINA AI STUDIO – DRIVER ASSISTANT V2

Privacy-first, offline-first navigation architecture.

## Stage 1
- OpenStreetMap as canonical map data source.
- MapLibre Native / MapLibre React Native for Android/iOS rendering and offline packs.
- Provider interfaces for map, search, routing and voice.
- Local persistence for favorites, offline regions and imported GPX/KML tracks.
- Existing Mapbox functionality remains available during migration until open-source equivalents pass device tests.

## Later stages
- Navigation engine: turn-by-turn, rerouting, lane guidance, ETA, multi-stop routes.
- AI Driver: natural-language commands mapped to typed intents.
- Vision AI: on-device recognition for road signs, pedestrians, bicycles, lights and lanes.
- OBD-II telemetry.
- Driver coaching.
- Emergency workflows.
- HUD.
- Lumina Voice Studio integration.

## Production gates
- npm run typecheck passes.
- Android real-device GPS/navigation smoke test.
- Airplane-mode test with downloaded region.
- Route persistence across background/foreground.
- No mandatory paid API key for core offline navigation.
