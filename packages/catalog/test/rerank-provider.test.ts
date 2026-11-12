// cloud-pi-catalog: adapted copy of oh-my-pi packages/catalog/test/rerank-provider.test.ts
// (commit e325ffc73ab8; v18.18.7). Node.js adaptation; see PATCHES.md.
// See PATCHES.md.
import { describe, expect, test } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { buildModel } from "@cloud-pi/catalog/build";
import type { ModelSpec } from "@cloud-pi/catalog/types";
import { compileCompatRules } from "../scripts/compat-compiler";

const RULES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/compat/rules");

describe("rerank catalog policy", () => {
	test("OpenRouter's documented rerank seed resolves onto the rerank runner", async () => {
		const rules = await compileCompatRules(RULES_DIR);
		const provider = rules.providers.openrouter;
		if (!provider?.seed) throw new Error("openrouter has no catalog seed");
		expect(provider.kindApis?.rerank).toBe("openrouter-rerank");
		const models = provider.seed.models
			.filter(row => row.api === "openrouter-rerank")
			.map(row => buildModel(row as ModelSpec));
		expect(models.map(model => model.id)).toEqual(["cohere/rerank-v3.5"]);
		expect(models[0]).toMatchObject({
			kind: "rerank",
			api: "openrouter-rerank",
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		});
	});
});
