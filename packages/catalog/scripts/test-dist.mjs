import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const packageDir = path.resolve(import.meta.dirname, "..");
const temp = mkdtempSync(path.join(tmpdir(), "cloud-pi-catalog-dist-"));
const installed = path.join(temp, "node_modules", "@cloud-pi", "catalog");

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
		entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
	);
}

try {
	cpSync(path.join(packageDir, "dist"), path.join(installed, "dist"), { recursive: true });
	writeFileSync(
		path.join(installed, "package.json"),
		JSON.stringify({
			name: "@cloud-pi/catalog",
			version: "0.1.0",
			type: "module",
			exports: JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8")).exports,
		}),
	);
	writeFileSync(path.join(temp, "package.json"), JSON.stringify({ type: "module", private: true }));
	writeFileSync(path.join(temp, ".env"), "CLOUD_PI_CATALOG_IMPORT_TEST=must-not-load\n");

	const stale = walk(installed).filter(file => {
		if (!file.endsWith(".js") && !file.endsWith(".d.ts")) return false;
		const text = readFileSync(file, "utf8");
		if (file.endsWith(".d.ts")) {
			return text
				.split("\n")
				.some(line => /^(?:import|export)\b/.test(line) && line.includes("@oh-my-pi/"));
		}
		return text.includes("@oh-my-pi/") || text.includes("packages/catalog/src") || text.includes("bun:");
	});
	if (stale.length > 0) throw new Error(`installed output references private sources: ${stale.join(", ")}`);

	const smoke = `
		import assert from "node:assert/strict";
		import { getBundledModels, getBundledProviders } from "@cloud-pi/catalog";
		import { buildModel } from "@cloud-pi/catalog/build";
		import { resolveModelPolicy } from "@cloud-pi/catalog/compat/resolve";
		import { openaiModelManagerOptions } from "@cloud-pi/catalog/provider-models/openai-compat";

		assert.equal(process.env.CLOUD_PI_CATALOG_IMPORT_TEST, undefined, "catalog import must not load dotenv");
		assert.ok(getBundledProviders().includes("anthropic"));
		const models = getBundledModels("anthropic");
		assert.ok(models.length > 0);
		assert.equal(typeof models[0].id, "string");
		const built = buildModel({
			id: "claude-sonnet-4-5",
			name: "Claude Sonnet 4.5",
			api: "anthropic-messages",
			provider: "anthropic",
			baseUrl: "https://api.anthropic.com",
			reasoning: true,
			input: ["text", "image"],
			cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
			contextWindow: 200000,
			maxTokens: 64000,
		});
		assert.equal(built.id, "claude-sonnet-4-5");
		assert.equal(typeof resolveModelPolicy, "function");
		assert.equal(typeof openaiModelManagerOptions, "function");
		console.log("catalog dist smoke ok");
	`;
	const result = spawnSync(process.execPath, ["--input-type=module", "-e", smoke], {
		cwd: temp,
		stdio: "inherit",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`catalog dist smoke failed with ${result.status}`);

	writeFileSync(
		path.join(temp, "consumer.ts"),
		`import { getBundledModels } from "@cloud-pi/catalog";\nimport { buildModel } from "@cloud-pi/catalog/build";\nconst count: number = getBundledModels("anthropic").length;\nvoid buildModel;\nvoid count;\n`,
	);
	writeFileSync(
		path.join(temp, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				strict: true,
				noEmit: true,
				module: "NodeNext",
				moduleResolution: "NodeNext",
				target: "ES2024",
				types: ["node"],
				typeRoots: [path.resolve(packageDir, "../../node_modules/@types")],
			},
			include: ["consumer.ts"],
		}),
	);
	const typecheck = spawnSync(
		process.execPath,
		[path.resolve(packageDir, "../../node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"],
		{ cwd: temp, stdio: "inherit" },
	);
	if (typecheck.error) throw typecheck.error;
	if (typecheck.status !== 0) throw new Error(`catalog declaration smoke failed with ${typecheck.status}`);
} finally {
	rmSync(temp, { recursive: true, force: true });
}
