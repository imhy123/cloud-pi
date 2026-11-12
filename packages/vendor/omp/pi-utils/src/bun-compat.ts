// cloud-pi-vendor: new file. Node stand-ins for the Bun globals the retained utility sources use.
// See PATCHES.md.
/**
 * The vendored oh-my-pi utility sources reference a small set of Bun globals.
 * `@cloud-pi/tui` replaces free `Bun` references at bundle time; the shared
 * vendor package is consumed by catalog without that bundler hook, so it imports
 * this module explicitly instead.
 *
 * Every value here is deterministic across processes and is implemented with
 * Node built-ins: hashes are SHA-256 prefixes, globbing is a pure RegExp
 * translation, and PATH lookup follows the host platform's rules.
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { setTimeout as sleepPromise } from "node:timers/promises";
import * as util from "node:util";
import { isMainThread } from "node:worker_threads";

export interface WhichOptions {
	cwd?: string;
	PATH?: string;
}

/** Deterministic 64-bit hash used for cache fingerprints and path suffixes. */
export function hashString(input: string | Uint8Array): bigint {
	const digest = createHash("sha256").update(input).digest();
	return digest.readBigUInt64BE(0);
}

const ANSI_PATTERN =
	/[\u001B\u009B](?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\)|[@-_])/g;

function stripAnsi(text: string): string {
	return text.replace(ANSI_PATTERN, "");
}

const GLOB_SPECIAL = /[*?[\]{}]/;

function globToRegExp(pattern: string): RegExp {
	let source = "";
	for (let index = 0; index < pattern.length; index++) {
		const char = pattern[index];
		if (char === "*") {
			if (pattern[index + 1] === "*") {
				index++;
				if (pattern[index + 1] === "/") {
					index++;
					source += "(?:[^/]+/)*";
				} else {
					source += ".*";
				}
			} else {
				source += "[^/]*";
			}
			continue;
		}
		if (char === "?") {
			source += "[^/]";
			continue;
		}
		if (char === "{") {
			const end = pattern.indexOf("}", index + 1);
			if (end !== -1) {
				const alternatives = pattern
					.slice(index + 1, end)
					.split(",")
					.map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
				source += `(?:${alternatives.join("|")})`;
				index = end;
				continue;
			}
		}
		source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
	return new RegExp(`^${source}$`);
}

class Glob {
	#pattern: string;

	constructor(pattern: string) {
		this.#pattern = pattern;
	}

	match(value: string): boolean {
		return globToRegExp(this.#pattern.replaceAll("\\", "/")).test(value.replaceAll("\\", "/"));
	}
}

function isExecutable(file: string): boolean {
	try {
		const stat = fs.statSync(file);
		if (!stat.isFile()) return false;
		if (process.platform !== "win32") fs.accessSync(file, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function which(command: string, options?: WhichOptions): string | null {
	const candidates: string[] = [];
	const extensions =
		process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";") : [""];
	const check = (base: string): string | null => {
		for (const extension of extensions) {
			const candidate = base + extension;
			if (isExecutable(candidate)) return candidate;
		}
		return null;
	};
	if (command.includes("/") || command.includes("\\")) {
		const base = path.isAbsolute(command) ? command : path.resolve(options?.cwd ?? process.cwd(), command);
		const found = check(base);
		return found ? path.resolve(found) : null;
	}
	for (const dir of (options?.PATH ?? process.env.PATH ?? "").split(path.delimiter)) {
		if (!dir) continue;
		const found = check(path.join(path.resolve(options?.cwd ?? process.cwd(), dir), command));
		if (found) candidates.push(found);
	}
	return candidates[0] ?? null;
}

/** Bun-runtime surface used by the vendored sources, backed by Node built-ins. */
export const Bun = {
	env: process.env as Record<string, string>,
	hash: Object.assign((input: string | Uint8Array) => hashString(input), {
		wyhash: (input: string | Uint8Array) => hashString(input),
	}),
	isMainThread,
	main: process.argv[1] ?? "",
	stripANSI: stripAnsi,
	sleep: (milliseconds: number) => sleepPromise(milliseconds),
	inspect: (value: unknown, options?: { colors?: boolean }) =>
		util.inspect(value, { colors: options?.colors === true }),
	Glob,
	which,
	deepEquals: (a: unknown, b: unknown) => util.isDeepStrictEqual(a, b),
};

export type BunWhichOptions = WhichOptions;
export { GLOB_SPECIAL as hasGlobMetacharacters };
