/**
 * Test bootstrap. The vendored sources reference the free `Bun` identifier,
 * which the production build replaces with `src/compat/bun.ts` via esbuild's
 * `inject`. Vitest loads the TypeScript sources unmodified, so the shim has to
 * exist on the global object before any source module is evaluated.
 */

import { Bun } from "../src/compat/bun";

(globalThis as typeof globalThis & { Bun?: unknown }).Bun = Bun;
