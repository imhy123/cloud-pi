// cloud-pi-vendor: new file. Import purity and explicit environment bootstrap regressions.
// See PATCHES.md.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

let directory: string;

beforeEach(() => {
	directory = mkdtempSync(path.join(tmpdir(), "cloud-pi-env-test-"));
	vi.resetModules();
	vi.stubEnv("PI_CODING_AGENT_DIR", directory);
	vi.stubEnv("CLOUD_PI_ENV_TEST_VALUE", undefined);
	vi.stubEnv("CLOUD_PI_ENV_TEST_EXISTING", "launcher");
	vi.stubEnv("MallocStackLogging", "1");
	writeFileSync(path.join(directory, ".env"), "CLOUD_PI_ENV_TEST_VALUE=from-file\n");
});

afterEach(() => {
	vi.unstubAllEnvs();
	rmSync(directory, { recursive: true, force: true });
});

describe("environment bootstrap", () => {
	it("does not load dotenv or scrub the environment when the utility barrel is imported", async () => {
		const utils = await import("../src/index");
		expect(utils.$env.CLOUD_PI_ENV_TEST_VALUE).toBeUndefined();
		expect(process.env.MallocStackLogging).toBe("1");
	});

	it("loads only after explicit initialization, retaining host values and file precedence", async () => {
		const env = await import("../src/env");
		const roots = Object.fromEntries(["cwd", "home", "configDir", "agentDir"].map(key => {
			const dir = path.join(directory, key);
			mkdirSync(dir);
			writeFileSync(path.join(dir, ".env"), `CLOUD_PI_ENV_TEST_VALUE=${key}\nCLOUD_PI_ENV_TEST_EXISTING=file\n`);
			return [key, dir];
		}));
		env.initializeEnvironment(roots);
		expect(env.$env.CLOUD_PI_ENV_TEST_VALUE).toBe("cwd");
		expect(env.$env.CLOUD_PI_ENV_TEST_EXISTING).toBe("launcher");
		expect(process.env.MallocStackLogging).toBeUndefined();

		writeFileSync(path.join(roots.cwd!, ".env"), "CLOUD_PI_ENV_TEST_VALUE=changed\n");
		env.initializeEnvironment(roots);
		expect(env.$env.CLOUD_PI_ENV_TEST_VALUE).toBe("cwd");
	});
});
