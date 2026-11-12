// cloud-pi-vendor: adapted copy of oh-my-pi packages/utils/src/tls-fetch.ts
// (commit e325ffc73ab8; v18.18.7). Pass-through wrapper; Node owns NODE_EXTRA_CA_CERTS trust.
// See PATCHES.md.
/**
 * Fetch surface shared by catalog discovery and request plumbing.
 *
 * Node's `fetch` already merges `NODE_EXTRA_CA_CERTS` into the process trust
 * store at startup, so no per-request TLS patching is needed. Keeping the
 * wrapper (instead of deleting its call sites) preserves upstream composition
 * and leaves certificate policy to Node rather than reimplementing it.
 */
export type FetchImpl = ((input: string | URL | Request, init?: RequestInit) => Promise<Response>) & {
	preconnect?: (url: string | URL) => void;
};

/** Returns the supplied fetch unchanged; Node owns extra-CA handling. */
export function wrapFetchForExtraCa(fetchImpl: FetchImpl): FetchImpl {
	return fetchImpl;
}
