import { afterEach, describe, expect, it } from "vitest";
import { Text } from "../src/components/text";
import type { RenderScheduler, RenderTimer } from "../src/tui";
import { TUI, type TuiPaint } from "../src/tui";
import type { Terminal, TerminalAppearance } from "../src/terminal";

class ManualScheduler implements RenderScheduler {
	#now = 0;
	#immediates: Array<() => void> = [];
	#timers: Array<{ callback: () => void; delayMs: number; cancelled: boolean }> = [];

	now(): number {
		return this.#now;
	}

	scheduleImmediate(callback: () => void): void {
		this.#immediates.push(callback);
	}

	scheduleRender(callback: () => void, delayMs: number): RenderTimer {
		const timer = { callback, delayMs, cancelled: false };
		this.#timers.push(timer);
		return {
			cancel: () => {
				timer.cancelled = true;
			},
		};
	}

	runImmediates(): void {
		const pending = this.#immediates;
		this.#immediates = [];
		for (const callback of pending) callback();
	}

	runTimers(): void {
		const pending = this.#timers.filter(timer => !timer.cancelled);
		this.#timers = [];
		for (const timer of pending) timer.callback();
	}
}

class RecordingTerminal implements Terminal {
	columns = 40;
	rows = 10;
	writes: string[] = [];
	started = false;
	stopped = false;
	cursorHidden = false;
	appearance: TerminalAppearance | undefined;
	onInput?: (data: string) => void;
	onResize?: () => void;

	get kittyProtocolActive(): boolean {
		return false;
	}
	get kittyEnableSequence(): string | null {
		return null;
	}

	start(onInput: (data: string) => void, onResize: () => void): void {
		this.started = true;
		this.onInput = onInput;
		this.onResize = onResize;
	}

	stop(): void {
		this.stopped = true;
	}

	async drainInput(): Promise<void> {}

	write(data: string): void {
		this.writes.push(data);
	}

	moveBy(): void {}
	hideCursor(): void {
		this.cursorHidden = true;
	}
	showCursor(): void {
		this.cursorHidden = false;
	}
	clearLine(): void {}
	clearFromCursor(): void {}
	clearScreen(): void {}
	setTitle(): void {}
	setProgress(): void {}
	onAppearanceChange(): void {}

	emitInput(data: string): void {
		this.onInput?.(data);
	}

	get output(): string {
		return this.writes.join("");
	}
}

const openTuis: TUI[] = [];

function createTui(): { tui: TUI; terminal: RecordingTerminal; scheduler: ManualScheduler; paints: TuiPaint[] } {
	const terminal = new RecordingTerminal();
	const scheduler = new ManualScheduler();
	const paints: TuiPaint[] = [];
	const tui = new TUI(terminal, false, { renderScheduler: scheduler, onPaint: paint => paints.push(paint) });
	openTuis.push(tui);
	return { tui, terminal, scheduler, paints };
}

afterEach(() => {
	for (const tui of openTuis.splice(0)) tui.stop();
});

describe("TUI painting", () => {
	it("starts, paints the component tree, and reports it through the paint listener", () => {
		const { tui, terminal, scheduler, paints } = createTui();
		tui.addChild(new Text("hello", 0, 0));
		tui.start({ deferInput: true });

		expect(terminal.started).toBe(true);
		expect(terminal.cursorHidden).toBe(true);
		expect(paints).toHaveLength(0);

		scheduler.runImmediates();

		expect(paints).toHaveLength(1);
		const [paint] = paints;
		expect(paint?.columns).toBe(40);
		expect(paint?.rows).toBe(10);
		expect(paint?.alt).toBe(false);
		expect(paint?.viewport.some(row => row.includes("hello"))).toBe(true);
		expect(terminal.writes.length).toBeGreaterThan(0);
	});

	it("repaints synchronously on renderNow and keeps the frame write observable", () => {
		const { tui, scheduler, paints } = createTui();
		const frames: string[] = [];
		tui.addChild(new Text("one", 0, 0));
		tui.start({ deferInput: true });
		scheduler.runImmediates();
		tui.addFrameWriteListener(data => frames.push(data));

		tui.clear();
		tui.addChild(new Text("two", 0, 0));
		tui.renderNow();

		expect(paints.at(-1)?.viewport.some(row => row.includes("two"))).toBe(true);
		expect(frames.length).toBe(1);
		expect(frames[0]).toContain("two");
	});

	it("erases scrollback and repaints from row zero on resetDisplay", () => {
		const { tui, terminal, scheduler, paints } = createTui();
		tui.addChild(new Text("hello", 0, 0));
		tui.start({ deferInput: true });
		scheduler.runImmediates();

		tui.resetDisplay();

		const paint = paints.at(-1)!;
		expect(paint.reset).toBe(true);
		expect(terminal.output).toContain("\x1b[2J\x1b[3J");
		expect(paint.viewport.some(row => row.includes("hello"))).toBe(true);
	});

	it("stops painting after stop and hands the cursor back", () => {
		const { tui, terminal, scheduler, paints } = createTui();
		tui.addChild(new Text("hello", 0, 0));
		tui.start({ deferInput: true });
		scheduler.runImmediates();

		tui.stop();
		expect(terminal.stopped).toBe(true);
		expect(terminal.cursorHidden).toBe(false);

		const paintsAfterStop = paints.length;
		const writesAfterStop = terminal.writes.length;
		tui.requestRender(true);
		scheduler.runImmediates();
		expect(paints).toHaveLength(paintsAfterStop);
		expect(terminal.writes).toHaveLength(writesAfterStop);
	});
});

describe("TUI input routing", () => {
	it("forwards raw input to listeners until they unsubscribe", () => {
		const { tui, terminal, scheduler } = createTui();
		tui.addChild(new Text("hello", 0, 0));
		tui.start({ deferInput: true });
		scheduler.runImmediates();

		const seen: string[] = [];
		const unsubscribe = tui.addInputListener(data => {
			seen.push(data);
			return undefined;
		});
		terminal.emitInput("a");
		terminal.emitInput("b");
		unsubscribe();
		terminal.emitInput("c");

		expect(seen).toEqual(["a", "b"]);
	});

	it("lets a listener consume input before the focused component sees it", () => {
		const { tui, terminal, scheduler } = createTui();
		const received: string[] = [];
		const component = {
			focused: false,
			render: () => ["z"],
			handleInput: (data: string) => {
				received.push(data);
			},
		};
		tui.addChild(component);
		tui.start({ deferInput: true });
		tui.setFocus(component);
		scheduler.runImmediates();

		tui.addInputListener(data => (data === "\x03" ? { consume: true as const } : undefined));
		terminal.emitInput("\x03");
		terminal.emitInput("z");

		expect(received).toEqual(["z"]);
	});
});

describe("TUI overlays", () => {
	it("composites an overlay above the component tree and removes it when hidden", () => {
		const { tui, scheduler, paints } = createTui();
		tui.addChild(new Text("base", 0, 0));
		tui.start({ deferInput: true });
		scheduler.runImmediates();

		tui.showOverlay(new Text("OVER", 0, 0), { row: 0, col: 0, width: 10 });
		tui.renderNow();
		expect(tui.hasOverlay()).toBe(true);
		expect(paints.at(-1)?.viewport[0]).toContain("OVER");

		tui.hideOverlay();
		tui.renderNow();
		expect(tui.hasOverlay()).toBe(false);
		expect(paints.at(-1)?.viewport.some(row => row.includes("OVER"))).toBe(false);
	});
});
