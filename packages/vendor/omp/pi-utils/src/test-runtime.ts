// cloud-pi-vendor: adapted copy of oh-my-pi packages/utils/src/test-runtime.ts
// (commit e325ffc73ab8; v18.18.7). process.env and process.argv[1] replace Bun env/main.
// See PATCHES.md.
const TEST_ENTRY_PATTERN = /[._](?:test|spec)\.[cm]?[jt]sx?$/;

/** True when the process is an explicitly marked test child or a test entrypoint is running. */
export function isBunTestRuntime(): boolean {
	if (process.env.PI_TEST_RUNTIME === "1") return true;
	const hasTestEnvironment = process.env.BUN_ENV === "test" || process.env.NODE_ENV === "test";
	return hasTestEnvironment && TEST_ENTRY_PATTERN.test(process.argv[1] ?? "");
}
