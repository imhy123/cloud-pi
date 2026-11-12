// cloud-pi client-tui: adapted from oh-my-pi packages/coding-agent/src/config/settings.ts
// (commit e325ffc73ab8; v18.18.7). Node YAML storage for the shared client directory;
// client-tui language and theme mappings are supported. See ../../PATCHES.md.
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { messages, LocalizedError } from "@cloud-pi/common";
import { isMap, parseDocument } from "yaml";

export type ClientLanguage = "en" | "zh-CN";
export const CLIENT_LANGUAGES: readonly ClientLanguage[] = ["en", "zh-CN"];

export class ClientSettings {
	readonly path: string;
	language: ClientLanguage | undefined;
	darkTheme: string | undefined;
	lightTheme: string | undefined;
	error: LocalizedError | undefined;
	#loaded = false;
	#snapshot: string | null = null;
	#saving: Promise<void> = Promise.resolve();

	constructor(path = join(homedir(), ".cloud-pi", "client", "config.yml")) {
		this.path = path;
	}

	async load(): Promise<void> {
		try {
			const raw = await this.#read();
			const doc = parseDocument(raw ?? "");
			if (doc.errors.length > 0) throw doc.errors[0];
			if (doc.contents !== null && !isMap(doc.contents)) {
				throw new LocalizedError("Expected a YAML mapping", messages.message("settings.error.invalidMapping"));
			}
			const client = doc.get("client-tui", true);
			if (client !== undefined && !isMap(client)) {
				throw new LocalizedError("client-tui must be a mapping", messages.message("settings.error.invalidClient"));
			}
			const themes = doc.getIn(["client-tui", "theme"], true);
			if (themes !== undefined && !isMap(themes)) {
				throw new LocalizedError("client-tui.theme must be a mapping", messages.message("settings.error.invalidTheme"));
			}
			const legacy = doc.get("appearance", true);
			const language = doc.getIn(["client-tui", "language"])
				?? (isMap(legacy) ? doc.getIn(["appearance", "language"]) : undefined);
			if (language !== undefined && language !== "en" && language !== "zh-CN") {
				throw new LocalizedError("client-tui.language must be en or zh-CN", messages.message("settings.error.invalidLanguage"));
			}
			const dark = doc.getIn(["client-tui", "theme", "dark"]);
			const light = doc.getIn(["client-tui", "theme", "light"]);
			if (
				(dark !== undefined && (typeof dark !== "string" || !dark.trim()))
				|| (light !== undefined && (typeof light !== "string" || !light.trim()))
			) {
				throw new LocalizedError("Theme values must be nonempty strings", messages.message("settings.error.invalidTheme"));
			}
			this.language = language;
			this.darkTheme = dark as string | undefined;
			this.lightTheme = light as string | undefined;
			this.#snapshot = raw;
			this.error = undefined;
			this.#loaded = true;
		} catch (error) {
			this.error = error instanceof LocalizedError
				? error
				: new LocalizedError("Could not read or parse the configuration", messages.message("settings.error.loadFailed"), { cause: error });
			this.#loaded = false;
		}
	}

	async setLanguage(language: ClientLanguage): Promise<void> {
		if (!CLIENT_LANGUAGES.includes(language)) {
			throw new LocalizedError("Unsupported language", messages.message("settings.error.invalidLanguage"));
		}
		await this.#save(["client-tui", "language"], language);
		this.language = language;
	}

	async setTheme(mode: "dark" | "light", name: string): Promise<void> {
		if (!name.trim()) {
			throw new LocalizedError("Theme must be nonempty", messages.message("settings.error.invalidTheme"));
		}
		await this.#save(["client-tui", "theme", mode], name);
		if (mode === "dark") {
			this.darkTheme = name;
		} else {
			this.lightTheme = name;
		}
	}

	async #save(path: string[], value: string): Promise<void> {
		const save = async () => {
			if (!this.#loaded) {
				throw this.error ?? new LocalizedError("Settings have not been loaded", messages.message("settings.error.notLoaded"));
			}
			const current = await this.#read();
			this.#assertUnchanged(current);
			const doc = parseDocument(current ?? "");
			const legacy = doc.getIn(["appearance", "language"]);
			if (this.language && doc.getIn(["client-tui", "language"]) === undefined) {
				doc.setIn(["client-tui", "language"], this.language);
			}
			if (legacy === "en" || legacy === "zh-CN") {
				doc.deleteIn(["appearance", "language"]);
			}
			doc.setIn(path, value);
			const output = doc.toString();
			await mkdir(dirname(this.path), { recursive: true });
			const temp = `${this.path}.${randomUUID()}.tmp`;
			try {
				await writeFile(temp, output, { encoding: "utf8", mode: 0o600, flag: "wx" });
				this.#assertUnchanged(await this.#read());
				await rename(temp, this.path);
			} finally {
				await unlink(temp).catch(() => {});
			}
			this.#snapshot = output;
		};
		const pending = this.#saving.then(save).catch((error: unknown) => {
			if (error instanceof LocalizedError) throw error;
			throw new LocalizedError("Could not save the configuration", messages.message("settings.error.saveFailed"), { cause: error });
		});
		this.#saving = pending.catch(() => {});
		return pending;
	}

	#assertUnchanged(current: string | null): void {
		if (current !== this.#snapshot) {
			throw new LocalizedError(
				"Configuration changed externally; restart before saving",
				messages.message("settings.error.conflict"),
			);
		}
	}

	async #read(): Promise<string | null> {
		try {
			return await readFile(this.path, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw error;
		}
	}
}
