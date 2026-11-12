// cloud-pi-catalog: verbatim copy of oh-my-pi packages/catalog/src/provider-models/models-dev-policies.ts
// (commit e325ffc73ab8; v18.18.7).
// See PATCHES.md.
import { isExcludedModel } from "../compat/behavior";
import type { Api, ModelSpec } from "../types";

/**
 * Remove models.dev rows that OMP cannot route successfully; the roster
 * policy lives in the `exclude-models` behavior rules.
 *
 * Generation and runtime refresh share this policy so a live catalog cannot
 * reintroduce selectors deliberately excluded from the bundled catalog.
 */
export function filterModelsDevCatalogRows<TApi extends Api>(models: readonly ModelSpec<TApi>[]): ModelSpec<TApi>[] {
	return models.filter(model => !isExcludedModel(model.provider, model.id));
}
