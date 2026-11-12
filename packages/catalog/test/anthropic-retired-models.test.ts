// cloud-pi-catalog: adapted copy of oh-my-pi packages/catalog/test/anthropic-retired-models.test.ts
// (commit e325ffc73ab8; v18.18.7). Node.js adaptation; see PATCHES.md.
// See PATCHES.md.
import { expect, test } from "vitest";
import { filterModelsDevCatalogRows } from "@cloud-pi/catalog/provider-models/models-dev-policies";
import type { ModelSpec } from "@cloud-pi/catalog/types";

function anthropicModel(id: string, provider = "anthropic"): ModelSpec<"anthropic-messages"> {
	return {
		id,
		name: id,
		api: "anthropic-messages",
		provider,
		baseUrl: "https://api.anthropic.com",
		reasoning: false,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200_000,
		maxTokens: 8_192,
	};
}

test("drops retired Anthropic API snapshots but keeps active ones and other hosts", () => {
	const models = filterModelsDevCatalogRows([
		anthropicModel("claude-3-5-sonnet-20240620"),
		anthropicModel("claude-3-haiku-20240307"),
		anthropicModel("claude-sonnet-4-0"),
		anthropicModel("claude-opus-4-1-20250805"),
		anthropicModel("claude-3-5-sonnet-20241022"),
		anthropicModel("claude-sonnet-4-5-20250929"),
		anthropicModel("claude-3-5-sonnet-20240620", "amazon-bedrock"),
	]);

	expect(models.map(model => `${model.provider}/${model.id}`)).toEqual([
		"anthropic/claude-sonnet-4-5-20250929",
		"amazon-bedrock/claude-3-5-sonnet-20240620",
	]);
});
