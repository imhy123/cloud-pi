// cloud-pi-catalog: new file. Injected credentials, discovery preparation, async GitLab, fallback, and host loading regressions.
// See PATCHES.md.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { generateModels, type ModelGenerationHost } from "../scripts/generate-models";
import { loadModelGenerationHost } from "../scripts/generation-host";
import { buildModel } from "../src/build";
import { getCatalogProvider, openModelCatalog } from "../src/model-catalog-format";

const mocks = vi.hoisted(() => ({
	createOptions: vi.fn(config => config),
	refresh: vi.fn(),
}));

vi.mock("../src/provider-models/descriptors", () => ({
	PROVIDER_DESCRIPTORS: [{
		providerId: "host-test",
		dynamicModelsAuthoritative: true,
		catalogDiscovery: { label: "Host Test", envVars: [] },
		createModelManagerOptions: mocks.createOptions,
	}],
}));

vi.mock("../src/model-manager", () => ({
	createModelManager: () => ({ refresh: mocks.refresh }),
}));

vi.mock("../src/provider-models/openai-compat", async importOriginal => {
	const original = await importOriginal<typeof import("../src/provider-models/openai-compat")>();
	return { ...original, fetchWellKnownModels: vi.fn(async () => ({})) };
});

let directory: string;

function model(provider: string, id: string) {
	return buildModel({
		id,
		name: id,
		provider,
		api: "openai-completions",
		baseUrl: "https://example.invalid/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 32768,
		maxTokens: 4096,
	});
}

beforeEach(() => {
	directory = mkdtempSync(path.join(tmpdir(), "cloud-pi-generation-host-"));
	vi.clearAllMocks();
	vi.spyOn(console, "log").mockImplementation(() => {});
	mocks.refresh.mockResolvedValue({ models: [model("host-test", "from-host")], stale: false });
});

afterEach(() => {
	vi.restoreAllMocks();
	rmSync(directory, { recursive: true, force: true });
});

describe("model generation host", () => {
	it("uses supplied credentials and provider preparation, then closes the auth handle", async () => {
		const close = vi.fn();
		const get = vi.fn(async () => "stored-test-key");
		const prepare = vi.fn(({ apiKey }: { apiKey?: string }) => ({ apiKey: `prepared-${apiKey}` }));
		const host: ModelGenerationHost = {
			discoverAuthStorage: async () => ({
				keys: { get },
				oauth: { access: async () => null, accessAll: async () => [] },
				close,
			}),
			getProviderDefinition: () => ({ prepareModelDiscovery: prepare }),
		};
		const outputPath = path.join(directory, "models.json");
		await generateModels({ provider: "host-test", host, outputPath });
		expect(get).toHaveBeenCalledWith("host-test");
		expect(close).toHaveBeenCalledTimes(1);
		expect(prepare).toHaveBeenCalledWith({ apiKey: "stored-test-key" });
		expect(mocks.createOptions).toHaveBeenCalledWith({ apiKey: "prepared-stored-test-key" });
		const catalog = openModelCatalog(JSON.parse(readFileSync(outputPath, "utf8")));
		expect(getCatalogProvider(catalog, "host-test")?.["from-host"]?.id).toBe("from-host");
	}, 30_000);

	it("awaits supplied GitLab models and supports generation without an auth-storage host", async () => {
		const outputPath = path.join(directory, "models.json");
		const getGitLabDuoModels = vi.fn(async () => [model("gitlab-duo", "from-gitlab-host")]);
		await generateModels({ provider: "gitlab-duo", host: { getGitLabDuoModels }, outputPath });
		expect(getGitLabDuoModels).toHaveBeenCalledTimes(1);
		const catalog = openModelCatalog(JSON.parse(readFileSync(outputPath, "utf8")));
		expect(getCatalogProvider(catalog, "gitlab-duo")?.["from-gitlab-host"]).toBeDefined();
	}, 30_000);

	it("preserves bundled fallback data when no host is supplied", async () => {
		const outputPath = path.join(directory, "models.json");
		await generateModels({ provider: "anthropic", outputPath });
		const catalog = openModelCatalog(JSON.parse(readFileSync(outputPath, "utf8")));
		expect(Object.keys(getCatalogProvider(catalog, "anthropic") ?? {}).length).toBeGreaterThan(0);
	}, 30_000);

	it("loads the CLI host module and rejects invalid hooks before generation", async () => {
		const valid = path.join(directory, "host.mjs");
		writeFileSync(valid, 'export default { getGitLabDuoModels: async () => [] };\n');
		const host = await loadModelGenerationHost(valid);
		expect(await host.getGitLabDuoModels?.()).toEqual([]);
		const invalid = path.join(directory, "invalid.mjs");
		writeFileSync(invalid, 'export default { discoverAuthStorage: true };\n');
		await expect(loadModelGenerationHost(invalid)).rejects.toThrow("discoverAuthStorage must be a function");
	});
});
