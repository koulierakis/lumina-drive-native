import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function OfflineMapsWebFallback() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>LUMINA Offline Maps</Text>
      <Text style={styles.body}>Οι offline χάρτες MapLibre είναι διαθέσιμοι στην native εφαρμογή Android/iOS.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#070b12' },
  title: { color: '#ffffff', fontSize: 24, fontWeight: '700', marginBottom: 10 },
  body: { color: '#9aa8bb', textAlign: 'center', maxWidth: 520 },
});
