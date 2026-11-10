// cloud-pi-tui: new file. Ambient typings for the injected `Bun` shim.
// See PATCHES.md.
/**
 * Type surface for the injected `Bun` identifier. The bundler rewrites free
 * `Bun` references to the shim exported from `./bun.ts`; TypeScript sees this
 * global declaration instead.
 *
 * `Timer` and `Dict` are Bun's global aliases that the vendored sources use;
 * Node.js spells them `NodeJS.Timeout` and `Record<string, T>`.
 */

import type { BunShim } from "./bun";

declare global {
	const Bun: BunShim;

	type Timer = NodeJS.Timeout;
	type Dict<T = unknown> = Record<string, T>;

	namespace Bun {
		interface WhichOptions {
			cwd?: string;
			PATH?: string;
		}
	}
}

export {};
