// cloud-pi-catalog: adapted copy of oh-my-pi packages/catalog/test/video-provider.test.ts
// (commit e325ffc73ab8; v18.18.7). Node.js adaptation; see PATCHES.md.
// See PATCHES.md.
import { describe, expect, test } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { buildModel } from "@cloud-pi/catalog/build";
import type { ModelSpec } from "@cloud-pi/catalog/types";
import { compileCompatRules } from "../scripts/compat-compiler";

const RULES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/compat/rules");

describe("video catalog policy", () => {
	test("OpenRouter's bundled video fallbacks resolve onto the video runner", async () => {
		const rules = await compileCompatRules(RULES_DIR);
		const provider = rules.providers.openrouter;
		if (!provider?.seed) throw new Error("openrouter has no catalog seed");
		expect(provider.kindApis?.video).toBe("openrouter-video");
		const models = provider.seed.models
			.filter(row => row.api === "openrouter-video")
			.map(row => buildModel(row as ModelSpec));
		expect(models.map(model => model.id)).toEqual(["google/veo-3.1", "minimax/hailuo-3", "alibaba/wan-2.7"]);
		for (const model of models) {
			expect(model).toMatchObject({
				kind: "video",
				api: "openrouter-video",
				baseUrl: "https://openrouter.ai/api/v1",
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			});
		}
	});
});
