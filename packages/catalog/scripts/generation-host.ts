// cloud-pi-catalog: new file. Explicit typed programmatic and local ESM host services for live generation.
// See PATCHES.md.
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { Api, Model } from "../src/types";

export interface OAuthAccess {
	accessToken: string;
	projectId?: string;
	accountId?: string;
}

export type OAuthAccessResult = ({ ok: true } & OAuthAccess) | { ok: false; error: string };

export interface AuthStorageHost {
	keys: { get(id: string): Promise<string | null> };
	oauth: {
		access(provider: string): Promise<OAuthAccess | null>;
		accessAll(provider: string): Promise<OAuthAccessResult[]>;
	};
	close(): void;
}

export interface ModelGenerationHost {
	/** Each call returns a handle that the generator closes after use. */
	discoverAuthStorage?(): Promise<AuthStorageHost>;
	getProviderDefinition?(providerId: string): {
		prepareModelDiscovery?: (config: { apiKey?: string }) => { apiKey?: string };
	} | undefined;
	getGitLabDuoModels?(): readonly Model<Api>[] | Promise<readonly Model<Api>[]>;
}

/** Load an explicitly selected local ESM host module. No implicit host discovery. */
export async function loadModelGenerationHost(filename: string): Promise<ModelGenerationHost> {
	const module = await import(pathToFileURL(path.resolve(filename)).href);
	const host: unknown = module.default;
	if (host === null || typeof host !== "object") {
		throw new TypeError("Model generation host must default-export an object");
	}
	for (const key of ["discoverAuthStorage", "getProviderDefinition", "getGitLabDuoModels"] as const) {
		if (key in host && typeof (host as Record<string, unknown>)[key] !== "function") {
			throw new TypeError(`Model generation host ${key} must be a function`);
		}
	}
	return host as ModelGenerationHost;
}
