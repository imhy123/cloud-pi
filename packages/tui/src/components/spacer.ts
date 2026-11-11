// cloud-pi-tui: adapted copy of oh-my-pi packages/tui/src/components/spacer.ts
// (commit e325ffc73ab8; v18.18.7). Removed the TSP `describe()` implementation; the `render()` path is unchanged.
// See PATCHES.md.
import type { Component } from "../tui";

/**
 * Spacer component that renders empty lines
 */
export class Spacer implements Component {
	#lines: number;
	#cached: string[] | undefined;

	constructor(lines: number = 1) {
		this.#lines = lines;
	}
	/** Return the spacer height for debug inspection. */
	debugState(): Record<string, unknown> {
		return { height: this.#lines };
	}

	setLines(lines: number): void {
		if (lines === this.#lines) return;
		this.#lines = lines;
		this.#cached = undefined;
	}
	invalidate(): void {
		// No cached state to invalidate currently
	}

	render(_width: number): readonly string[] {
		let cached = this.#cached;
		if (cached === undefined) {
			// oxlint-disable-next-line unicorn/no-new-array -- cached line allocation
			cached = new Array(this.#lines).fill("");
			this.#cached = cached;
		}
		return cached;
	}
}
