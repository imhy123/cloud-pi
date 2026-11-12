// Adapted from oh-my-pi packages/tui/test/mermaid-cache.test.ts (v18.18.7): Vitest, local imports and async worker assertions.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as mermaidAscii from "../src/compat/mermaid-ascii";
import { clearMermaidCache, resolveMermaidAscii } from "../src/theme/mermaid-cache";

describe("resolveMermaidAscii resize selection", () => {
	const renders: string[] = [];

	beforeEach(() => {
		renders.length = 0;
		clearMermaidCache();
		vi.spyOn(mermaidAscii, "renderMermaidAsciiSafe").mockImplementation(async (source, options) => {
			const direction = options?.direction ?? "authored";
			renders.push(`${source}:${direction}`);
			if (source === "bad") return null;
			if (source === "wide-authored") {
				if (direction === "authored") return "AUTHORED-ALSO-WIDE\nsecond\nthird";
				if (direction === "TD") return "td\ntd\ntd";
				return "left-to-right";
			}
			if (source === "colored") {
				if (direction === "authored") return "\u001b[31mabcd\u001b[0m";
				if (direction === "TD") return "too-wide-for-four";
				return "z";
			}
			return "direction-ignored-and-wide";
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("keeps the authored layout when no width is given", async () => {
		expect(await resolveMermaidAscii("wide-authored")).toBe("AUTHORED-ALSO-WIDE\nsecond\nthird");
		expect(renders).toEqual(["wide-authored:authored"]);
	});

	it("picks the shortest fitting orientation, then switches when a resize makes it overflow", async () => {
		expect(await resolveMermaidAscii("wide-authored", { maxWidth: 30 })).toBe("left-to-right");
		expect(renders).toEqual(["wide-authored:authored", "wide-authored:TD", "wide-authored:LR"]);

		expect(await resolveMermaidAscii("wide-authored", { maxWidth: 10 })).toBe("td\ntd\ntd");
		expect(renders).toHaveLength(3);
	});

	it("uses the narrowest layout only when nothing fits", async () => {
		expect(await resolveMermaidAscii("wide-authored", { maxWidth: 1 })).toBe("td\ntd\ntd");
	});

	it("measures themed ASCII without counting ANSI", async () => {
		expect(await resolveMermaidAscii("colored", { maxWidth: 4 })).toBe("\u001b[31mabcd\u001b[0m");
	});

	it("returns null without trying orientations when the source fails", async () => {
		expect(await resolveMermaidAscii("bad", { maxWidth: 80 })).toBeNull();
		expect(renders).toEqual(["bad:authored"]);
	});

	it("renders diagrams that ignore direction only as authored", async () => {
		const sources = [
			"sequenceDiagram\nAlice->>Bob: hi",
			"classDiagram\nclass A",
			"erDiagram\nA ||--o{ B : rel",
			"xychart-beta\nbar [1, 2]",
			"xychart\nbar [1, 2]",
		];
		for (const source of sources) {
			renders.length = 0;
			clearMermaidCache();
			expect(await resolveMermaidAscii(source, { maxWidth: 4 })).toBe("direction-ignored-and-wide");
			expect(renders).toEqual([`${source}:authored`]);
		}
	});

	it("skips the forced render that repeats a flowchart's authored direction", async () => {
		const cases: Array<[string, string[]]> = [
			["flowchart TD\nA --> B", ["LR"]],
			["graph tb\nA --> B", ["LR"]],
			["flowchart LR\nA --> B", ["TD"]],
			["graph RL\nA --> B", ["TD"]],
			["flowchart BT\nA --> B", ["TD", "LR"]],
			["stateDiagram-v2\n[*] --> A", ["LR"]],
			["stateDiagram-v2\ndirection LR\nA --> B", ["TD"]],
			["stateDiagram-v2\nstate Nested {\ndirection LR\nA --> B\n}", ["LR"]],
		];
		for (const [source, forced] of cases) {
			renders.length = 0;
			clearMermaidCache();
			await resolveMermaidAscii(source, { maxWidth: 4 });
			expect(renders).toEqual([`${source}:authored`, ...forced.map(direction => `${source}:${direction}`)]);
		}
	});
	it("coalesces concurrent requests for the same source/options", async () => {
		const values = await Promise.all([resolveMermaidAscii("wide-authored"), resolveMermaidAscii("wide-authored")]);
		expect(values[0]).toBe(values[1]);
		expect(renders).toEqual(["wide-authored:authored"]);
	});
	it("does not repopulate a cleared cache from an old in-flight result", async () => {
		const gate = Promise.withResolvers<string | null>();
		const spy = vi.mocked(mermaidAscii.renderMermaidAsciiSafe);
		spy.mockImplementationOnce(() => gate.promise);
		const pending = resolveMermaidAscii("pending");
		clearMermaidCache();
		gate.resolve("OLD"); await pending;
		await resolveMermaidAscii("pending");
		expect(spy).toHaveBeenCalledTimes(2);
	});

});
