// cloud-pi-catalog: adapted copy of oh-my-pi packages/catalog/test/descriptors.test.ts
// (commit e325ffc73ab8; v18.18.7). Node.js adaptation; see PATCHES.md.
// See PATCHES.md.
import { describe, expect, test } from "vitest";
import { PROVIDER_DESCRIPTORS } from "@cloud-pi/catalog/provider-models";

describe("catalog provider descriptors", () => {
	test("every descriptor has a default model and a factory that preserves provider identity", () => {
		for (const descriptor of PROVIDER_DESCRIPTORS) {
			expect(descriptor.defaultModel).toBeTruthy();
			expect(typeof descriptor.createModelManagerOptions).toBe("function");
			expect(descriptor.createModelManagerOptions({ apiKey: "k" }).providerId).toBe(descriptor.providerId);
		}
	});
});
