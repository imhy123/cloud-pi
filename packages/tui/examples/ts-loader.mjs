// Runs @cloud-pi/tui straight from src/, so examples do not need a build (or an
// npm install of the package into this directory).
//
// Node 26 strips types but no longer transforms TypeScript-only syntax, and the
// sources use enums, so each file is transpiled with the repository's own
// TypeScript install. The resolve hook maps "@cloud-pi/tui" and the build-time
// @oh-my-pi/* aliases onto src/, and adds the extensions the sources omit.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const vendor = name => path.join(root, "src/vendor/pi-utils", name);

// Mirrors the entries in tsup.config.ts.
const packageEntries = {
	"": "src/index.ts",
	theme: "src/theme/index.ts",
	components: "entries/components.ts",
	render: "src/render/index.ts",
	image: "entries/image.ts",
	notifications: "entries/notifications.ts",
	multiplexers: "entries/multiplexers.ts",
	keys: "src/keys.ts",
};

// Mirrors the aliases in tsup.config.ts.
const aliases = new Map(
	[
		["@oh-my-pi/pi-natives", "src/compat/natives.ts"],
		["@oh-my-pi/pi-natives/path", "src/compat/natives-path.ts"],
		["@oh-my-pi/pi-ai", "src/compat/pi-ai.ts"],
		["@oh-my-pi/pi-agent-core", "src/compat/pi-agent-core.ts"],
	].map(([specifier, file]) => [specifier, path.join(root, file)]),
);

function aliasTarget(specifier) {
	if (specifier === "@oh-my-pi/pi-utils") {
		return vendor("index.ts");
	}
	if (specifier.startsWith("@oh-my-pi/pi-utils/")) {
		return vendor(`${specifier.slice("@oh-my-pi/pi-utils/".length)}.ts`);
	}
	return aliases.get(specifier);
}

function packageTarget(specifier) {
	if (specifier === "@cloud-pi/tui") {
		return path.join(root, packageEntries[""]);
	}
	if (specifier.startsWith("@cloud-pi/tui/")) {
		const entry = packageEntries[specifier.slice("@cloud-pi/tui/".length)];
		return entry ? path.join(root, entry) : undefined;
	}
	return undefined;
}

function asFile(candidate) {
	for (const file of [candidate, `${candidate}.ts`, path.join(candidate, "index.ts")]) {
		if (fs.existsSync(file) && fs.statSync(file).isFile()) {
			return file;
		}
	}
	return undefined;
}

function relativeTarget(specifier, parentURL) {
	if (!specifier.startsWith(".") || !parentURL?.startsWith("file:")) {
		return undefined;
	}
	return asFile(fileURLToPath(new URL(specifier, parentURL)));
}

export function resolve(specifier, context, nextResolve) {
	const direct = packageTarget(specifier) ?? aliasTarget(specifier);
	const target = direct ? asFile(direct) : relativeTarget(specifier, context.parentURL);
	if (target) {
		return { url: pathToFileURL(target).href, shortCircuit: true };
	}
	return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
	if (!url.startsWith("file:") || !url.endsWith(".ts")) {
		return nextLoad(url, context);
	}
	const file = fileURLToPath(url);
	const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), {
		fileName: file,
		compilerOptions: {
			// Below ESNext, TypeScript aliases the class (`_a`) for private static
			// accesses in field initializers, and assigns the alias after the
			// class body has already run static initializers.
			target: ts.ScriptTarget.ESNext,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			isolatedModules: true,
		},
	});
	return { format: "module", source: outputText, shortCircuit: true };
}
