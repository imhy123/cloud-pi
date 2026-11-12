// Remove private vendor side-effect imports from emitted declarations and fail
// if any remaining import/export still points at a workspace-private package.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

const dist = path.resolve(import.meta.dirname, "../dist");
const files = readdirSync(dist, { recursive: true, withFileTypes: true })
	.filter(entry => entry.isFile() && entry.name.endsWith(".d.ts"))
	.map(entry => path.join(entry.parentPath, entry.name));

for (const file of files) {
	const text = readFileSync(file, "utf8");
	const cleaned = text.replace(/^import ['"]@oh-my-pi\/[^'"]+['"];\n/gm, "");
	if (cleaned !== text) writeFileSync(file, cleaned);
	const offending = cleaned
		.split("\n")
		.filter(line => /^(?:import|export)\b/.test(line) && line.includes("@oh-my-pi/"));
	if (offending.length) throw new Error(`${file}: declarations still reference private packages:\n${offending.join("\n")}`);
}
console.log(`cleaned ${files.length} declaration files`);
