import { parseClientArgs } from "./cli-options";
import { VERSION } from "./version";

let options: ReturnType<typeof parseClientArgs> | undefined;
try {
	options = parseClientArgs(process.argv.slice(2));
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}

if (options?.version) {
	console.log(`cloud-pi ${VERSION}`);
} else if (options) {
	const { startClient } = await import("./main");
	await startClient(options);
}
