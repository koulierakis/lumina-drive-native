import type { RoutingProvider, SearchProvider } from './providers';
import type { RouteRequest, RouteResult, SearchResult } from './types';

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

export async function searchOfflineFirst(
  query: string,
  providers: SearchProvider[],
): Promise<SearchResult[]> {
  const failures: string[] = [];
  for (const provider of providers) {
    try {
      const status = await provider.availability();
      if (!status.available) {
        failures.push(`${provider.id}: ${status.reason ?? 'unavailable'}`);
        continue;
      }
      const results = await provider.search(query, { offlineOnly: status.offlineCapable });
      if (results.length > 0) return results;
    } catch (error) {
      failures.push(`${provider.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  throw new ProviderUnavailableError(failures.join('; ') || 'No search provider available');
}

export async function routeOfflineFirst(
  request: RouteRequest,
  providers: RoutingProvider[],
): Promise<RouteResult> {
  const failures: string[] = [];
  for (const provider of providers) {
    try {
      const status = await provider.availability();
      if (!status.available) {
        failures.push(`${provider.id}: ${status.reason ?? 'unavailable'}`);
        continue;
      }
      return await provider.route(request);
    } catch (error) {
      failures.push(`${provider.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  throw new ProviderUnavailableError(failures.join('; ') || 'No routing provider available');
}
