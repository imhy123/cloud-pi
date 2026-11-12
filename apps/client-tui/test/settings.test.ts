import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeTranslations, createLanguage, LocalizedError } from "@cloud-pi/common";
import { initTheme } from "@cloud-pi/tui";
import { ClientSettings } from "../src/settings/store";
import { messages } from "@cloud-pi/common";
import { SettingsController } from "../src/settings/controller";
import { SettingsSelectorComponent } from "../src/tui/components/settings-selector";

async function isolated(run: (path: string) => Promise<void>) {
	const dir = await mkdtemp(join(tmpdir(), "cloud-pi-settings-"));
	try { await run(join(dir, "client", "config.yml")); } finally { await rm(dir, { recursive: true, force: true }); }
}

async function waitForOptions(panel: SettingsSelectorComponent): Promise<void> {
	const deadline = Date.now() + 5000;
	while (panel.render(120).join("\n").includes("Loading options")) {
		if (Date.now() > deadline) throw new Error("Options did not finish loading");
		await new Promise(resolve => setTimeout(resolve, 5));
	}
}

test("creates shared YAML and retains unknown fields and comments", async () => isolated(async path => {
	const settings = new ClientSettings(path);
	await settings.load();
	assert.equal(settings.language, undefined);
	await settings.setLanguage("zh-CN");
	assert.match(await readFile(path, "utf8"), /language: zh-CN/);
	await writeFile(path, "# shared settings\nappearance:\n  language: zh-CN\notherClient:\n  value: 4\n");
	await settings.load();
	await settings.setLanguage("en");
	const output = await readFile(path, "utf8");
	assert.match(output, /# shared settings/);
	assert.match(output, /language: en/);
	assert.match(output, /otherClient:\n  value: 4/);
	const reloaded = new ClientSettings(path); await reloaded.load();
	assert.equal(reloaded.language, "en");
}));

test("preserves malformed and externally changed files", async () => isolated(async path => {
	const settings = new ClientSettings(path); await settings.load(); await settings.setLanguage("en");
	await writeFile(path, "appearance: [\n"); await settings.load();
	assert.ok(settings.error); await assert.rejects(settings.setLanguage("zh-CN"));
	assert.equal(await readFile(path, "utf8"), "appearance: [\n");
	await writeFile(path, "appearance:\n  language: en\n"); await settings.load();
	await writeFile(path, "appearance:\n  language: zh-CN\nexternal: true\n");
	await assert.rejects(settings.setLanguage("zh-CN"), /changed externally/);
	assert.match(await readFile(path, "utf8"), /external: true/);
}));

test("settings panel keeps Language and language names readable in both locales", async () => isolated(async path => {
	await initTheme();
	const settings = new ClientSettings(path); await settings.load();
	for (const code of ["en", "zh-CN"] as const) {
		const lang = createLanguage(code, composeTranslations(messages.translations), () => {});
		const t = messages.in(lang);
		let done = false;
		const panel = new SettingsSelectorComponent(new SettingsController(settings, lang), () => 24, () => {}, () => { done = true; });
		const lines = panel.render(100).join("\n");
		assert.ok(lines.includes("Language"));
		assert.ok(lines.includes(code === "en" ? "English" : "中文（简体）"));
		panel.handleInput("z"); panel.handleInput("z"); panel.handleInput("z");
		const noMatches = panel.render(100).join("\n");
		assert.ok(noMatches.includes(t("settings.noMatches")));
		assert.ok(noMatches.includes(t("settings.searchHelp")));
		panel.handleInput("\x1b"); assert.equal(done, false);
		panel.handleInput("\x1b"); assert.equal(done, true);
	}
}));

test("selecting the native language label saves its locale and leaves current UI language unchanged", async () => isolated(async path => {
	await initTheme();
	const settings = new ClientSettings(path); await settings.load();
	const t = messages.in(createLanguage("en", composeTranslations(messages.translations), () => {}));
	const saved = Promise.withResolvers<void>();
	const panel = new SettingsSelectorComponent(new SettingsController(settings, createLanguage("en", composeTranslations(messages.translations), () => {})), () => 24, () => { if (settings.language === "zh-CN") saved.resolve(); }, () => {});
	for (let i = 0; i < 4; i++) panel.handleInput("\x1b[B");
	panel.handleInput("\r");
	const options = panel.render(80).join("\n");
	assert.ok(options.includes("English")); assert.ok(options.includes("中文（简体）"));
	panel.handleInput("\x1b[B"); panel.handleInput("\r"); await saved.promise;
	assert.match(await readFile(path, "utf8"), /language: zh-CN/);
	assert.ok(panel.render(80).join("\n").includes("Restart to apply"));
}));

test("stores separate theme mappings under client-tui and preserves shared provider configuration", async () => isolated(async path => {
	const settings = new ClientSettings(path); await settings.load();
	await settings.setLanguage("zh-CN");
	await writeFile(path, `# shared\nproviders:\n  example:\n    enabled: true\nclient-tui:\n  language: zh-CN\n`);
	await settings.load(); await settings.setTheme("dark", "dark"); await settings.setTheme("light", "light");
	const output = await readFile(path, "utf8");
	assert.match(output, /providers:\n  example:\n    enabled: true/);
	assert.match(output, /client-tui:\n  language: zh-CN\n  theme:\n    dark: dark\n    light: light/);
	const reloaded = new ClientSettings(path); await reloaded.load();
	assert.equal(reloaded.language, "zh-CN"); assert.equal(reloaded.darkTheme, "dark"); assert.equal(reloaded.lightTheme, "light");
}));

test("full screen frame exposes categories and mock entries do not mutate settings", async () => isolated(async path => {
	await initTheme();
	const settings = new ClientSettings(path); await settings.load();
	const t = messages.in(createLanguage("en", composeTranslations(messages.translations), () => {}));
	const panel = new SettingsSelectorComponent(new SettingsController(settings, createLanguage("en", composeTranslations(messages.translations), () => {})), () => 24, () => {}, () => {});
	let screen = panel.render(120).join("\n");
	assert.ok(screen.includes("Appearance")); assert.ok(screen.includes("Model")); assert.ok(screen.includes("Tools"));
	assert.ok(screen.includes("│"));
	panel.handleInput("\t"); screen = panel.render(120).join("\n");
	assert.ok(screen.includes("mock"));
	panel.handleInput("\r"); assert.equal(settings.language, undefined);
	await assert.rejects(readFile(path, "utf8"), { code: "ENOENT" });
}));

test("migrates the old language while preserving shared fields and existing client theme", async () => isolated(async path => {
	const settings = new ClientSettings(path); await settings.load(); await settings.setLanguage("en");
	await writeFile(path, '# legacy\nappearance:\n  language: zh-CN\n  other: keep\nclient-tui:\n  theme:\n    dark: titanium\nproviders:\n  sample: enabled\n');
	await settings.load(); assert.equal(settings.language, "zh-CN"); await settings.setTheme("light", "light");
	const output = await readFile(path, "utf8");
	assert.match(output, /client-tui:[\s\S]*language: zh-CN/);
	assert.match(output, /appearance:\n  other: keep/);
	assert.match(output, /providers:\n  sample: enabled/);
}));

test("theme selectors save independent dark and light mappings", async () => isolated(async path => {
	await initTheme();
	const settings = new ClientSettings(path); await settings.load();
	const t = messages.in(createLanguage("en", composeTranslations(messages.translations), () => {}));
	let changed = Promise.withResolvers<void>();
	const panel = new SettingsSelectorComponent(new SettingsController(settings, createLanguage("en", composeTranslations(messages.translations), () => {})), () => 24, () => changed.resolve(), () => {});
	panel.render(100);
	panel.handleInput("\r"); await waitForOptions(panel); panel.handleInput("\x1b[A"); panel.handleInput("\r");
	while (settings.darkTheme === undefined) { changed = Promise.withResolvers<void>(); await changed.promise; }
	panel.handleInput("\x1b[B"); panel.handleInput("\r"); await waitForOptions(panel); panel.handleInput("\x1b[B"); panel.handleInput("\r");
	while (settings.lightTheme === undefined) { changed = Promise.withResolvers<void>(); await changed.promise; }
	const reloaded = new ClientSettings(path); await reloaded.load();
	assert.equal(reloaded.darkTheme, settings.darkTheme); assert.equal(reloaded.lightTheme, settings.lightTheme);
	assert.ok(reloaded.darkTheme); assert.ok(reloaded.lightTheme);
}));

test("left and right cycle categories, while an open submenu keeps arrow input", async () => isolated(async path => {
	await initTheme();
	const settings = new ClientSettings(path); await settings.load();
	const t = messages.in(createLanguage("en", composeTranslations(messages.translations), () => {}));
	const panel = new SettingsSelectorComponent(new SettingsController(settings, createLanguage("en", composeTranslations(messages.translations), () => {})), () => 24, () => {}, () => {});
	const screen = () => panel.render(120).join("\n");
	assert.ok(screen().includes("Dark Theme"));
	panel.handleInput("\x1b[C");
	assert.ok(screen().includes("mock"));
	assert.ok(!screen().includes("Dark Theme"));
	panel.handleInput("\x1b[D");
	assert.ok(screen().includes("Dark Theme"));
	panel.handleInput("\x1b[D");
	assert.ok(screen().includes("mock"));
	panel.handleInput("\x1b[C");
	assert.ok(screen().includes("Dark Theme"));
	panel.handleInput("\r");
	await waitForOptions(panel);
	assert.ok(screen().includes("titanium"));
	panel.handleInput("\x1b[C");
	assert.ok(screen().includes("titanium"));
	panel.handleInput("\x1b");
	assert.ok(screen().includes("Dark Theme"));
}));

test("localized configuration errors keep their message data and causes", async () => isolated(async path => {
	const settings = new ClientSettings(path);
	await settings.load();
	await settings.setLanguage("en");
	await writeFile(path, "client-tui: [\n");
	await settings.load();
	assert.ok(settings.error instanceof LocalizedError);
	assert.equal(settings.error.messageData.namespace, "client-tui");
	assert.equal(settings.error.messageData.key, "settings.error.loadFailed");
	assert.ok(settings.error.cause instanceof Error);
	const language = createLanguage("zh-CN", composeTranslations(messages.translations), () => {});
	const controller = new SettingsController(settings, language);
	assert.equal(controller.errorText(settings.error), "无法读取或解析配置文件");
	const differentlyWorded = new LocalizedError("Different diagnostic wording", messages.message("settings.error.conflict"));
	assert.equal(controller.errorText(differentlyWorded), "配置已被外部修改，请重启后再保存");
}));

test("shared localized text uses English defaults for absent or foreign messages", async () => isolated(async path => {
	const settings = new ClientSettings(path);
	await settings.load();
	const language = createLanguage("zh-CN", composeTranslations(messages.translations), () => {});
	const controller = new SettingsController(settings, language);
	assert.equal(controller.localize({ defaultText: "English fallback" }), "English fallback");
	assert.equal(controller.localize({ defaultText: "English fallback", message: { namespace: "other", key: "missing", params: [] } }), "English fallback");
	assert.equal(controller.localize({ defaultText: "Theme", message: { namespace: "client-tui", key: "settings.group.theme", params: [] } }), "主题");
}));

test("dynamic option requests are cancelled on close and late results are ignored", async () => isolated(async path => {
	await initTheme();
	const settings = new ClientSettings(path);
	await settings.load();
	const language = createLanguage("en", composeTranslations(messages.translations), () => {});
	const pending = Promise.withResolvers<readonly import("../src/settings/definitions").SettingOption[]>();
	let signal: AbortSignal | undefined;
	const controller = new SettingsController(settings, language, undefined, {
		themes(context) {
			signal = context.signal;
			return pending.promise;
		},
	});
	const panel = new SettingsSelectorComponent(controller, () => 24, () => {}, () => {});
	panel.handleInput("\r");
	assert.ok(panel.render(120).join("\n").includes("Loading options"));
	panel.handleInput("\x1b");
	assert.equal(signal?.aborted, true);
	pending.resolve([{ value: "late", label: { defaultText: "LATE RESULT" } }]);
	await Promise.resolve();
	await Promise.resolve();
	assert.ok(!panel.render(120).join("\n").includes("LATE RESULT"));
}));
