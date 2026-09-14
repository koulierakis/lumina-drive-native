# LUMINA Drive V2 — Offline Routing Architecture

Status: implementation decision

## Decision

LUMINA Drive V2 uses separate open components for rendering, routing, search, and online fallback instead of coupling the product to a single map vendor.

### Map rendering

- MapLibre React Native is the only native map renderer.
- OpenStreetMap-derived data is the canonical map-data source.
- RNMapbox is not linked into the native application because its New Architecture codegen collides with MapLibre.
- The current Mapbox HTTP search/directions adapters remain temporary online fallbacks only and can be removed after offline providers reach production readiness.

### Offline routing

Primary Android candidate: Valhalla Mobile with on-device Valhalla graph tiles.

The application will not build routing graphs on the phone. Region packages are generated outside the app from OpenStreetMap extracts, versioned, signed/checksummed, downloaded by the app, and stored locally. The native routing engine reads the installed graph package and answers route requests without network access.

The JavaScript provider contract remains `RoutingProvider`; platform-native details stay behind a local Expo module. The bridge uses raw JSON routing requests/responses where practical to minimize coupling to generated model versions.

### Region package lifecycle

Each package needs:

- stable region ID and human-readable name;
- graph-data version and OSM snapshot timestamp;
- bounding box;
- download size;
- SHA-256 checksum;
- minimum app/engine version;
- download URL;
- installed path and state;
- atomic install/upgrade/rollback semantics.

Downloads must support resume and must be verified before activation. A failed or interrupted update must leave the last valid package usable.

### Offline search

Offline search is a separate provider. It must not depend on the routing engine being available. The preferred design is a compact region POI/address index derived from OpenStreetMap and stored locally, with an Organic Maps core integration retained as an alternative if it provides materially better search quality without unacceptable bridge/maintenance cost.

### Online fallback

When network is available, providers may fall back in this order:

1. installed offline provider;
2. configured open online provider such as self-hosted Nominatim/OSRM/Valhalla;
3. legacy Mapbox HTTP provider while migration is incomplete.

If the user requests offline-only operation, no online provider may be called.

### Offline map packages

The public OpenFreeMap style is suitable for online rendering. Production offline bulk downloads must not rely on crawling a public shared tile endpoint. Offline map data should be packaged or served from a controlled distribution source with explicit permission and versioning.

### Attribution

All map and data attribution required by OpenStreetMap, MapLibre, OpenMapTiles/OpenFreeMap, Organic Maps, or any selected data package must remain visible and compliant in the final UI.

## Production gates

Offline routing is considered production-ready only when all of the following pass:

1. native module compiles in the Expo 54 / React Native 0.81 New Architecture build;
2. a test graph package installs and verifies on a real Android device;
3. route generation works with airplane mode enabled;
4. multi-stop routing and route profiles work through the V2 provider contract;
5. the navigation engine can reroute against the local provider;
6. corrupt/partial package recovery is tested;
7. package updates do not invalidate a currently active route;
8. APK/AAB release build passes CI and real-device smoke testing.
