import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  ViewAnnotation,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import type { GeoPoint } from './types';
import { OPENFREEMAP_LIBERTY_STYLE } from './maplibre-offline-region-provider';

export type MapLibreMapSurfaceProps = {
  center: GeoPoint;
  route?: GeoPoint[];
  destination?: GeoPoint;
  zoom?: number;
  bearing?: number;
  pitch?: number;
  navigationActive?: boolean;
  trackUserLocation?: boolean;
  mapStyle?: string;
};

function routeBounds(route: GeoPoint[]) {
  if (route.length < 2) return null;
  let west = route[0].lng;
  let east = route[0].lng;
  let south = route[0].lat;
  let north = route[0].lat;
  for (const point of route) {
    west = Math.min(west, point.lng);
    east = Math.max(east, point.lng);
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
  }
  return { west, east, south, north };
}

export function MapLibreMapSurface({
  center,
  route = [],
  destination,
  zoom = 15,
  bearing = 0,
  pitch = 0,
  navigationActive = false,
  trackUserLocation = false,
  mapStyle = OPENFREEMAP_LIBERTY_STYLE,
}: MapLibreMapSurfaceProps) {
  const camera = useRef<CameraRef>(null);
  const routeData = useMemo(() => ({
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: route.map((point) => [point.lng, point.lat]),
    },
  }), [route]);

  useEffect(() => {
    if (navigationActive) {
      camera.current?.setCamera({
        centerCoordinate: [center.lng, center.lat],
        zoomLevel: zoom,
        bearing,
        pitch,
        animationDuration: 650,
      });
      return;
    }
    const bounds = routeBounds(route);
    if (bounds) {
      camera.current?.fitBounds(
        [bounds.east, bounds.north],
        [bounds.west, bounds.south],
        [70, 45, 70, 45],
        700,
      );
      return;
    }
    camera.current?.setCamera({
      centerCoordinate: [center.lng, center.lat],
      zoomLevel: zoom,
      bearing,
      pitch,
      animationDuration: 500,
    });
  }, [bearing, center.lat, center.lng, navigationActive, pitch, route, zoom]);

  return (
    <View style={styles.container}>
      <Map mapStyle={mapStyle} style={styles.map}>
        <Camera
          ref={camera}
          initialViewState={{ center: [center.lng, center.lat], zoom, bearing, pitch }}
          trackUserLocation={trackUserLocation ? 'course' : undefined}
        />
        {route.length >= 2 ? (
          <GeoJSONSource id="lumina-route-source" data={routeData}>
            <Layer
              id="lumina-route-line"
              type="line"
              source="lumina-route-source"
              paint={{
                'line-color': '#73C7FF',
                'line-width': navigationActive ? 9 : 7,
                'line-opacity': 0.94,
              }}
              layout={{
                'line-cap': 'round',
                'line-join': 'round',
              }}
            />
          </GeoJSONSource>
        ) : null}
        {destination ? (
          <ViewAnnotation id="lumina-destination" lngLat={[destination.lng, destination.lat]}>
            <View style={styles.destinationMarker} />
          </ViewAnnotation>
        ) : null}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  destinationMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#D8B66B',
    borderWidth: 3,
    borderColor: '#070A0F',
  },
});