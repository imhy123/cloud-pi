// cloud-pi-catalog: verbatim copy of oh-my-pi packages/catalog/src/compat/tools.ts
// (commit e325ffc73ab8; v18.18.7).
// See PATCHES.md.
import type { Model } from "../types";
import { resolveCatalogPolicy } from "./catalog-policy";

/** Whether the transport exposes native tools that an empty caller catalog cannot disable. */
export function requiresNativeTools(model: Model): boolean {
	return resolveCatalogPolicy(model).requiresNativeTools === true;
}

/** Whether disabling tools requires a history without prior tool calls or results. */
export function requiresToolFreeHistoryForToolOptOut(model: Model): boolean {
	return resolveCatalogPolicy(model).requiresToolFreeHistoryForToolOptOut === true;
}
