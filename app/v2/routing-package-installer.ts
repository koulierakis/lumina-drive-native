import {
  getRoutingPackage,
  patchRoutingPackage,
  upsertRoutingPackage,
  validateRoutingPackageManifest,
  type InstalledRoutingPackage,
  type RoutingPackageManifest,
} from './offline-routing-packages';

export interface RoutingPackageTransport {
  download(
    manifest: RoutingPackageManifest,
    destinationHint: string,
    onProgress: (progress: number) => void,
  ): Promise<string>;
  remove(path: string): Promise<void>;
}

export interface RoutingPackageIntegrity {
  sha256(path: string): Promise<string>;
}

export interface RoutingPackageActivator {
  activate(manifest: RoutingPackageManifest, downloadedPath: string): Promise<string>;
  deactivate?(installedPath: string): Promise<void>;
}

export class RoutingPackageInstaller {
  constructor(
    private readonly transport: RoutingPackageTransport,
    private readonly integrity: RoutingPackageIntegrity,
    private readonly activator: RoutingPackageActivator,
  ) {}

  async install(manifest: RoutingPackageManifest): Promise<InstalledRoutingPackage> {
    const manifestErrors = validateRoutingPackageManifest(manifest);
    if (manifestErrors.length) throw new Error(manifestErrors.join('; '));

    const existing = await getRoutingPackage(manifest.id);
    const now = new Date().toISOString();
    const initial: InstalledRoutingPackage = {
      manifest,
      state: existing?.state === 'ready' ? 'updating' : 'downloading',
      progress: 0,
      installedPath: existing?.installedPath,
      previousInstalledPath: existing?.previousInstalledPath,
      installedAt: existing?.installedAt,
      updatedAt: now,
    };
    await upsertRoutingPackage(initial);

    let downloadedPath: string | null = null;
    try {
      downloadedPath = await this.transport.download(
        manifest,
        `${manifest.id}-${manifest.version}`,
        (progress) => {
          patchRoutingPackage(manifest.id, { state: 'downloading', progress }).catch(() => undefined);
        },
      );

      await patchRoutingPackage(manifest.id, { state: 'verifying', progress: 1 });
      const digest = (await this.integrity.sha256(downloadedPath)).toLowerCase();
      if (digest !== manifest.sha256.toLowerCase()) {
        throw new Error(`SHA-256 mismatch for ${manifest.id}`);
      }

      const activatedPath = await this.activator.activate(manifest, downloadedPath);
      const ready: InstalledRoutingPackage = {
        manifest,
        state: 'ready',
        progress: 1,
        installedPath: activatedPath,
        previousInstalledPath: existing?.installedPath,
        installedAt: existing?.installedAt ?? now,
        updatedAt: new Date().toISOString(),
      };
      await upsertRoutingPackage(ready);

      if (existing?.previousInstalledPath && existing.previousInstalledPath !== activatedPath) {
        await this.transport.remove(existing.previousInstalledPath).catch(() => undefined);
      }
      return ready;
    } catch (error) {
      if (downloadedPath) await this.transport.remove(downloadedPath).catch(() => undefined);
      const message = error instanceof Error ? error.message : 'routing package install failed';
      const failed: InstalledRoutingPackage = {
        manifest,
        state: existing?.state === 'ready' && existing.installedPath ? 'ready' : 'failed',
        progress: existing?.state === 'ready' ? 1 : 0,
        installedPath: existing?.installedPath,
        previousInstalledPath: existing?.previousInstalledPath,
        installedAt: existing?.installedAt,
        updatedAt: new Date().toISOString(),
        error: message,
      };
      await upsertRoutingPackage(failed);
      throw error;
    }
  }

  async uninstall(id: string) {
    const existing = await getRoutingPackage(id);
    if (!existing) return;
    if (existing.installedPath) {
      await this.activator.deactivate?.(existing.installedPath).catch(() => undefined);
      await this.transport.remove(existing.installedPath).catch(() => undefined);
    }
    if (existing.previousInstalledPath) {
      await this.transport.remove(existing.previousInstalledPath).catch(() => undefined);
    }
    await patchRoutingPackage(id, {
      state: 'available',
      progress: 0,
      installedPath: undefined,
      previousInstalledPath: undefined,
      error: undefined,
    });
  }
}
