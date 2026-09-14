import type { RoutingProvider, SearchOptions, SearchProvider } from './providers';
import type { ProviderAvailability, RouteRequest, RouteResult, SearchResult } from './types';

export type ProviderPolicyOptions = {
  networkAvailable?: boolean;
  allowOnlineFallback?: boolean;
};

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

async function eligible<T extends { id: string; availability(): Promise<ProviderAvailability> }>(
  providers: T[],
  options: ProviderPolicyOptions,
): Promise<{ provider: T; status: ProviderAvailability }[]> {
  const statuses = await Promise.all(providers.map(async (provider) => ({
    provider,
    status: await provider.availability(),
  })));
  const available = statuses.filter(({ status }) => status.available);
  const offline = available.filter(({ status }) => status.offlineCapable);
  const online = available.filter(({ status }) => !status.offlineCapable);
  if (options.networkAvailable === false || options.allowOnlineFallback === false) return offline;
  return [...offline, ...online];
}

export async function searchOfflineFirst(
  query: string,
  providers: SearchProvider[],
  searchOptions: SearchOptions = {},
  policy: ProviderPolicyOptions = {},
): Promise<SearchResult[]> {
  const failures: string[] = [];
  const candidates = await eligible(providers, policy);
  for (const { provider, status } of candidates) {
    try {
      const results = await provider.search(query, {
        ...searchOptions,
        offlineOnly: policy.networkAvailable === false || policy.allowOnlineFallback === false
          ? true
          : searchOptions.offlineOnly,
      });
      if (results.length > 0) return results;
      failures.push(`${provider.id}: no results`);
    } catch (error) {
      failures.push(`${provider.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    if (!status.offlineCapable && policy.networkAvailable === false) break;
  }
  throw new ProviderUnavailableError(failures.join('; ') || 'No eligible search provider available');
}

export async function routeOfflineFirst(
  request: RouteRequest,
  providers: RoutingProvider[],
  policy: ProviderPolicyOptions = {},
): Promise<RouteResult> {
  const failures: string[] = [];
  const candidates = await eligible(providers, policy);
  for (const { provider } of candidates) {
    try {
      return await provider.route(request);
    } catch (error) {
      failures.push(`${provider.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  throw new ProviderUnavailableError(failures.join('; ') || 'No eligible routing provider available');
}
