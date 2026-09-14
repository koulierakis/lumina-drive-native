import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FavoritePlace } from './types';

const STORAGE_KEY = 'lumina-v2-favorites';
const STORAGE_VERSION = 1;

type FavoritesEnvelope = {
  version: number;
  items: FavoritePlace[];
};

function normalizeEnvelope(value: unknown): FavoritesEnvelope {
  if (!value || typeof value !== 'object') return { version: STORAGE_VERSION, items: [] };
  const envelope = value as Partial<FavoritesEnvelope>;
  if (!Array.isArray(envelope.items)) return { version: STORAGE_VERSION, items: [] };
  return {
    version: typeof envelope.version === 'number' ? envelope.version : STORAGE_VERSION,
    items: envelope.items.filter(Boolean) as FavoritePlace[],
  };
}

async function loadEnvelope(): Promise<FavoritesEnvelope> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return { version: STORAGE_VERSION, items: [] };
  try {
    return normalizeEnvelope(JSON.parse(raw));
  } catch {
    return { version: STORAGE_VERSION, items: [] };
  }
}

async function saveEnvelope(items: FavoritePlace[]) {
  const envelope: FavoritesEnvelope = { version: STORAGE_VERSION, items };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

export async function listFavorites(): Promise<FavoritePlace[]> {
  return (await loadEnvelope()).items;
}

export async function getFavorite(id: string): Promise<FavoritePlace | null> {
  return (await loadEnvelope()).items.find((item) => item.id === id) ?? null;
}

export async function upsertFavorite(input: Omit<FavoritePlace, 'createdAt' | 'updatedAt'> & Partial<Pick<FavoritePlace, 'createdAt'>>): Promise<FavoritePlace> {
  const envelope = await loadEnvelope();
  const now = new Date().toISOString();
  const existing = envelope.items.find((item) => item.id === input.id);
  const next: FavoritePlace = {
    ...input,
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: now,
  };
  const items = existing
    ? envelope.items.map((item) => (item.id === next.id ? next : item))
    : [next, ...envelope.items];
  await saveEnvelope(items);
  return next;
}

export async function removeFavorite(id: string): Promise<void> {
  const envelope = await loadEnvelope();
  await saveEnvelope(envelope.items.filter((item) => item.id !== id));
}

export async function clearFavorites(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
