import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import type { GeoPoint } from './types';
import { OPENFREEMAP_LIBERTY_STYLE } from './maplibre-offline-region-provider';

export type MapLibreMapSurfaceProps = {
  center: GeoPoint;
  route?: GeoPoint[];
  zoom?: number;
  bearing?: number;
  pitch?: number;
  trackUserLocation?: boolean;
  mapStyle?: string;
};

export function MapLibreMapSurface({
  center,
  route = [],
  zoom = 15,
  bearing = 0,
  pitch = 0,
  trackUserLocation = false,
  mapStyle = OPENFREEMAP_LIBERTY_STYLE,
}: MapLibreMapSurfaceProps) {
  const routeData = useMemo(() => ({
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: route.map((point) => [point.lng, point.lat]),
    },
  }), [route]);

  return (
    <View style={styles.container}>
      <Map mapStyle={mapStyle} style={styles.map} attributionEnabled>
        <Camera
          initialViewState={{ center: [center.lng, center.lat], zoom, bearing, pitch }}
          trackUserLocation={trackUserLocation ? 'course' : undefined}
          zoom={zoom}
          bearing={bearing}
          pitch={pitch}
        />
        {route.length >= 2 ? (
          <GeoJSONSource id="lumina-route-source" data={routeData}>
            <Layer
              id="lumina-route-line"
              type="line"
              source="lumina-route-source"
              paint={{
                'line-color': '#2f80ed',
                'line-width': 6,
                'line-opacity': 0.9,
              }}
              layout={{
                'line-cap': 'round',
                'line-join': 'round',
              }}
            />
          </GeoJSONSource>
        ) : null}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});
