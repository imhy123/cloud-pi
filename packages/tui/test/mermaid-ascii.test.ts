// Adapted from oh-my-pi packages/utils/test/mermaid-ascii.test.ts (v18.18.7): Vitest, local imports and async worker assertions.
import { describe, expect, it } from "vitest";
import { renderMermaidAscii, renderMermaidAsciiSafe } from "../src/vendor/pi-utils/mermaid-ascii";

describe("renderMermaidAscii", () => {
	it("renders through the worker with the requested options", async () => {
		const rendered = await renderMermaidAscii("graph LR\n  A --> B", { useAscii: true, colorMode: "none" });
		expect(rendered).toBe(
			["+---+     +---+", "|   |     |   |", "| A |---->| B |", "|   |     |   |", "+---+     +---+"].join("\n"),
		);
	});

	it("maps renderer errors to null in the safe variant", async () => {
		await expect(renderMermaidAscii("", { colorMode: "none" })).rejects.toThrow("Empty mermaid diagram");
		expect(await renderMermaidAsciiSafe("", { colorMode: "none" })).toBeNull();
	});
});
