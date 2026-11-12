// cloud-pi-catalog: adapted copy of oh-my-pi packages/catalog/test/google-aistudio-compat.test.ts
// (commit e325ffc73ab8; v18.18.7). Node.js adaptation; see PATCHES.md.
// See PATCHES.md.
import { describe, expect, it } from "vitest";
import { resolveModelPolicy } from "@cloud-pi/catalog/compat/resolve";
import type { ModelSpec } from "@cloud-pi/catalog/types";

/**
 * Google AI Studio's OpenAI-compatible endpoint
 * (`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`)
 * implements a subset of the chat-completions schema and rejects the `store`
 * field with HTTP 400 (`Invalid JSON payload received. Unknown name "store"`).
 * The provider must land in the non-standard set so `supportsStore` resolves
 * false and the wire never carries the field. The native Gemini path
 * (`google-generative-ai` api) is unaffected — it never emits `store`.
 */

const baseModel: Omit<ModelSpec<"openai-completions">, "provider" | "baseUrl"> = {
	api: "openai-completions",
	id: "gemini-2.5-flash",
	name: "Gemini 2.5 Flash",
	input: ["text", "image"],
	cost: { input: 0.15, output: 0.6, cacheRead: 0.015, cacheWrite: 0 },
	maxTokens: 65_536,
	contextWindow: 1_000_000,
	reasoning: true,
};

function aistudioByBaseUrl(provider: string): ModelSpec<"openai-completions"> {
	return {
		...baseModel,
		provider,
		baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
	};
}

describe("openai-completions compat — Google AI Studio openai-compat shim", () => {
	it("matches regardless of the custom provider id", () => {
		// users wire the host under arbitrary provider ids (models.yml `gemini`,
		// `google-aistudio`, …); detection is URL-based, not provider-based.
		const compat = resolveModelPolicy(aistudioByBaseUrl("my-custom-gemini")).compat;

		expect(compat.supportsStore).toBe(false);
	});

	it("leaves `store` enabled for standard OpenAI hosts", () => {
		const compat = resolveModelPolicy({
			...baseModel,
			provider: "openai",
			baseUrl: "https://api.openai.com/v1",
		}).compat;

		expect(compat.supportsStore).toBe(true);
	});
});
