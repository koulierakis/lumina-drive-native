import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OfflineRegion } from './types';

const STORAGE_KEY = 'lumina-v2-offline-regions';
const STORAGE_VERSION = 1;

type Envelope = {
  version: number;
  items: OfflineRegion[];
};

async function load(): Promise<Envelope> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return { version: STORAGE_VERSION, items: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<Envelope>;
    return {
      version: typeof parsed.version === 'number' ? parsed.version : STORAGE_VERSION,
      items: Array.isArray(parsed.items) ? (parsed.items as OfflineRegion[]) : [],
    };
  } catch {
    return { version: STORAGE_VERSION, items: [] };
  }
}

async function save(items: OfflineRegion[]) {
  const payload: Envelope = { version: STORAGE_VERSION, items };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export async function listOfflineRegions(): Promise<OfflineRegion[]> {
  return (await load()).items;
}

export async function getOfflineRegion(id: string): Promise<OfflineRegion | null> {
  return (await load()).items.find((item) => item.id === id) ?? null;
}

export async function saveOfflineRegion(region: OfflineRegion): Promise<void> {
  const envelope = await load();
  const exists = envelope.items.some((item) => item.id === region.id);
  const items = exists
    ? envelope.items.map((item) => (item.id === region.id ? region : item))
    : [region, ...envelope.items];
  await save(items);
}

export async function removeOfflineRegionRecord(id: string): Promise<void> {
  const envelope = await load();
  await save(envelope.items.filter((item) => item.id !== id));
}
