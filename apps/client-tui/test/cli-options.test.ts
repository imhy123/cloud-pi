import assert from "node:assert/strict";
import { test } from "node:test";
import { parseClientArgs } from "../src/cli-options";
import { createClientLocale } from "../src/i18n/locale";

test("language argument accepts supported locales and rejects invalid input", () => {
	assert.equal(parseClientArgs(["--language", "en"]).language, "en");
	assert.equal(parseClientArgs(["--language=zh-CN"]).language, "zh-CN");
	assert.equal(parseClientArgs(["--language", "zh_CN"]).language, "zh-CN");
	assert.equal(parseClientArgs(["-v"]).version, true);
	for (const args of [["--language"], ["--language", "fr"], ["--unknown"]]) {
		assert.throws(() => parseClientArgs(args));
	}
});

test("explicit startup language overrides the saved choice", () => {
	const saved = "zh-CN";
	const options = parseClientArgs(["--language", "en"]);
	assert.equal(createClientLocale(options.language ?? saved).language.locale, "en");
	assert.equal(createClientLocale(parseClientArgs([]).language ?? saved).language.locale, "zh-CN");
});
