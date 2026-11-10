// Preload for the examples: install the source loader, then expose the Bun shim
// the sources expect (the tsup build injects the same module).

import { registerHooks } from "node:module";
import { load, resolve } from "./ts-loader.mjs";

registerHooks({ resolve, load });

const { Bun } = await import("../src/compat/bun.ts");
globalThis.Bun = Bun;
