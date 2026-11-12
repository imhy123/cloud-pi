// cloud-pi-catalog: adapted copy of oh-my-pi packages/catalog/test/issue-830-repro.test.ts
// (commit e325ffc73ab8; v18.18.7). Node.js adaptation; see PATCHES.md.
// See PATCHES.md.
import { describe, expect, test } from "bun:test";
import { getOAuthProviders } from "@oh-my-pi/pi-ai/registry/oauth";
import { getEnvApiKey } from "@oh-my-pi/pi-ai/env-api-key";

describe("deepseek built-in provider (issue #830)", () => {
	test("registers DeepSeek as an API-key login provider", () => {
		const provider = getOAuthProviders().find(item => item.id === "deepseek");
		expect(provider?.name).toBe("DeepSeek");
		expect(provider?.available).toBe(true);
	});

	test("resolves DEEPSEEK_API_KEY via env", () => {
		const previous = process.env.DEEPSEEK_API_KEY;
		process.env.DEEPSEEK_API_KEY = "deepseek-test-key";
		try {
			expect(getEnvApiKey("deepseek")).toBe("deepseek-test-key");
		} finally {
			if (previous === undefined) {
				delete process.env.DEEPSEEK_API_KEY;
			} else {
				process.env.DEEPSEEK_API_KEY = previous;
			}
		}
	});
});
