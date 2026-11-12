// cloud-pi-catalog: verbatim copy of oh-my-pi packages/catalog/src/compat/server-side-fallback.ts
// (commit e325ffc73ab8; v18.18.7).
// See PATCHES.md.
import type { CatalogPolicyInputs } from "../types";
import { resolveCatalogPolicy } from "./catalog-policy";
import type { ResolveRoute } from "./resolve";

/**
 * Ordered model ids for Anthropic's server-side refusal `fallbacks` chain,
 * authored on the `server-side-fallback-models` catalog axis, on `route`'s
 * upstream when it names one. Empty when no rule assigns a chain (the model,
 * host or upstream does not support the feature).
 */
export function serverSideFallbackModels(model: CatalogPolicyInputs, route?: ResolveRoute): readonly string[] {
	const value = resolveCatalogPolicy(model, route).serverSideFallbackModels;
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === "string");
}
