// cloud-pi-catalog: new file. Vitest adapter for Bun's setSystemTime.
// See PATCHES.md.
import { vi } from "vitest";

/** Bun's `setSystemTime` for Vitest: fake only `Date`, and reset timer state on a bare call. */
export function setSystemTime(date?: Date): void {
	if (date === undefined) {
		vi.useRealTimers();
		return;
	}
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(date);
}
