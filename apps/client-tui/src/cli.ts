import { VERSION } from "./version";

const args = process.argv.slice(2);
if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) {
	console.log(`cloud-pi ${VERSION}`);
} else if (args.length === 0) {
	await import("./main");
} else {
	console.error(`Unknown arguments: ${args.join(" ")}`);
	process.exitCode = 1;
}
