// cloud-pi: new file. Parse client startup flags.
import { parseArgs } from "node:util";

export interface ClientOptions {
	language?: "en" | "zh-CN";
	version: boolean;
}

export function parseClientArgs(args: string[]): ClientOptions {
	const { values } = parseArgs({
		args,
		options: {
			language: { type: "string" },
			version: { type: "boolean", short: "v" },
		},
		allowPositionals: false,
	});
	let language: ClientOptions["language"];
	if (values.language !== undefined) {
		const canonical = Intl.getCanonicalLocales(values.language.replace(/_/g, "-"))[0];
		if (canonical !== "en" && canonical !== "zh-CN") {
			throw new Error("--language must be en or zh-CN");
		}
		language = canonical;
	}
	return { language, version: values.version === true };
}
