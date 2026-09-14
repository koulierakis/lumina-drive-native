import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BoundingBox } from './types';

const STORAGE_KEY = 'lumina-v2-routing-packages';
const SCHEMA_VERSION = 1;

export type RoutingPackageState =
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'failed'
  | 'updating';

export type RoutingPackageManifest = {
  id: string;
  name: string;
  version: string;
  osmSnapshot: string;
  bounds: BoundingBox;
  sizeBytes: number;
  sha256: string;
  downloadUrl: string;
  minimumAppVersion?: string;
  minimumEngineVersion?: string;
};

export type InstalledRoutingPackage = {
  manifest: RoutingPackageManifest;
  state: RoutingPackageState;
  progress: number;
  installedPath?: string;
  previousInstalledPath?: string;
  installedAt?: string;
  updatedAt: string;
  error?: string;
};

type Envelope = {
  version: number;
  packages: InstalledRoutingPackage[];
};

function normalizeProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

async function readEnvelope(): Promise<Envelope> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return { version: SCHEMA_VERSION, packages: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<Envelope>;
    if (parsed.version !== SCHEMA_VERSION || !Array.isArray(parsed.packages)) {
      return { version: SCHEMA_VERSION, packages: [] };
    }
    return {
      version: SCHEMA_VERSION,
      packages: parsed.packages.map((item) => ({
        ...item,
        progress: normalizeProgress(item.progress),
      })),
    };
  } catch {
    return { version: SCHEMA_VERSION, packages: [] };
  }
}

async function writeEnvelope(packages: InstalledRoutingPackage[]) {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: SCHEMA_VERSION, packages } satisfies Envelope),
  );
}

export async function listRoutingPackages() {
  return (await readEnvelope()).packages;
}

export async function getRoutingPackage(id: string) {
  return (await readEnvelope()).packages.find((item) => item.manifest.id === id) ?? null;
}

export async function upsertRoutingPackage(record: InstalledRoutingPackage) {
  const envelope = await readEnvelope();
  const next = envelope.packages.filter((item) => item.manifest.id !== record.manifest.id);
  next.push({ ...record, progress: normalizeProgress(record.progress) });
  next.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  await writeEnvelope(next);
  return record;
}

export async function patchRoutingPackage(
  id: string,
  patch: Partial<Omit<InstalledRoutingPackage, 'manifest'>>,
) {
  const envelope = await readEnvelope();
  const existing = envelope.packages.find((item) => item.manifest.id === id);
  if (!existing) return null;
  const updated: InstalledRoutingPackage = {
    ...existing,
    ...patch,
    progress: normalizeProgress(patch.progress ?? existing.progress),
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  };
  await writeEnvelope(
    envelope.packages.map((item) => (item.manifest.id === id ? updated : item)),
  );
  return updated;
}

export async function removeRoutingPackageRecord(id: string) {
  const envelope = await readEnvelope();
  const next = envelope.packages.filter((item) => item.manifest.id !== id);
  await writeEnvelope(next);
}

export function validateRoutingPackageManifest(manifest: RoutingPackageManifest): string[] {
  const errors: string[] = [];
  if (!manifest.id.trim()) errors.push('missing region id');
  if (!manifest.name.trim()) errors.push('missing region name');
  if (!manifest.version.trim()) errors.push('missing package version');
  if (!manifest.osmSnapshot.trim()) errors.push('missing OSM snapshot');
  if (!Number.isFinite(manifest.sizeBytes) || manifest.sizeBytes <= 0) errors.push('invalid package size');
  if (!/^[a-f0-9]{64}$/i.test(manifest.sha256)) errors.push('invalid SHA-256');
  if (!/^https:\/\//i.test(manifest.downloadUrl)) errors.push('download URL must use HTTPS');
  if (!(manifest.bounds.north > manifest.bounds.south)) errors.push('invalid north/south bounds');
  if (!(manifest.bounds.east > manifest.bounds.west)) errors.push('invalid east/west bounds');
  return errors;
}
