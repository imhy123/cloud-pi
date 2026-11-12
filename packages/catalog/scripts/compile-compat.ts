// cloud-pi-catalog: adapted copy of oh-my-pi packages/catalog/scripts/compile-compat.ts
// (commit e325ffc73ab8; v18.18.7). Node fs and fileURLToPath replace Bun.write and import.meta.dir.
// See PATCHES.md.
/**
 * `bun run gen:compat` — compiles `src/compat/rules/` into
 * `src/compat/rules.json`, the committed compiled form the runtime engine
 * imports. Mirrors the models.json discipline: deterministic output,
 * regenerate + commit together with rule changes.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { compileCompatRules, renderAuthIds, renderProviderIds } from "./compat-compiler";

const rulesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/compat/rules");
const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/compat/rules.json");
const authIdsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/compat/auth-ids.ts");
const providerIdsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/compat/provider-ids.ts");

const compiled = await compileCompatRules(rulesDir);
await fs.writeFile(outPath, JSON.stringify(compiled));
await fs.writeFile(authIdsPath, renderAuthIds(compiled.auth));
await fs.writeFile(providerIdsPath, renderProviderIds(compiled.providers));
console.log(
	`wrote ${path.relative(process.cwd(), outPath)} (${compiled.cascade.rules.length} rules, ${compiled.taxonomy.classes.length} classes, ${Object.keys(compiled.providers).length} catalog providers, ${compiled.auth.providers.length} auth providers, ${compiled.files.length} files)`,
);
