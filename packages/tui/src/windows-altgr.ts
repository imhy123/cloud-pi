// cloud-pi-tui: adapted copy of oh-my-pi packages/tui/src/windows-altgr.ts
// (commit e325ffc73ab8; v18.18.7). FFI `user32.dll` bridge removed; `readAltGrLayer` always reports an empty layer, keeping the injectable host seam.
// See PATCHES.md.
/**
 * Recover AltGr text that Windows console hosts drop under the kitty keyboard protocol.
 *
 * The kitty encoder shipped in Windows Terminal / OpenConsole before
 * microsoft/terminal#20052 reports AltGr+key as Alt (or Ctrl+Alt) plus the
 * layout's *unmodified* base key, without the produced text: Hungarian
 * AltGr+F arrives as `CSI 102;3u` instead of `[`. The byte stream is then
 * indistinguishable from a real Alt+F shortcut, so the character is lost and
 * the chord fires `alt+f` bindings instead.
 *
 * Recovery reads two pieces of local state the bytes lack:
 *  - whether Right Alt (AltGr) is physically held, via `GetAsyncKeyState`;
 *  - what the active keyboard layout's AltGr layer produces for the base key,
 *    via `ToUnicodeEx`.
 *
 * Layouts without an AltGr layer (US, UK, ...) resolve to an empty table once and
 * short-circuit every later event. The per-layout table is built once and cached;
 * it is rebuilt only when the foreground window reports a different layout handle.
 *
 * Known limitation: AltGr keys that produce a dead key on the active layout have no
 * table entry (`ToUnicodeEx` reports them as pending composition, not text), so those
 * chords keep reaching Alt bindings.
 */
import { parseKittySequence } from "./keys";

// cloud-pi-tui does not ship the Windows FFI AltGr bridge: with no `user32.dll`
// bindings the translator always reports "no AltGr layer", so Alt chords stay
// shortcuts. The injectable `AltGrHost` seam and the pure translation logic are
// kept so hosts (and tests) can supply a layout table without FFI.

const KITTY_MOD_SHIFT = 1;
const KITTY_MOD_ALT = 2;
const KITTY_MOD_CTRL = 4;
const KITTY_LOCK_MASK = 64 | 128;

/** Keyboard layout handle (`HKL`); kept as a bigint-shaped opaque value. */
export type KeyboardLayoutHandle = bigint;

const EMPTY_LAYER: ReadonlyMap<string, string> = new Map();

function tableKey(baseCodepoint: number, shift: boolean): string {
	return `${baseCodepoint}:${shift ? 1 : 0}`;
}

/**
 * AltGr layer of an explicit layout handle (`HKL`), keyed `"<baseCodepoint>:<shift 0|1>"`.
 * Without the Win32 bindings there is no layout to read, so the layer is empty.
 */
export function readAltGrLayer(_hkl: KeyboardLayoutHandle): ReadonlyMap<string, string> {
	return EMPTY_LAYER;
}

/** Local keyboard state the translator reads; injectable so tests need no live desktop. */
export interface AltGrHost {
	/** AltGr layer of the layout that produced the keystroke, keyed like {@link readAltGrLayer}. */
	activeLayer(): ReadonlyMap<string, string>;
	/** Whether Right Alt (AltGr) is held, or was within the last {@link RIGHT_ALT_LATCH_MS}. */
	isRightAltDown(): boolean;
}

/**
 * How long an observed Right Alt press keeps counting as held. Key state is sampled
 * at processing time, and one stdin read can carry several queued AltGr repeats that
 * are dispatched synchronously after the key is released; the latch keeps that tail
 * typing text. Far shorter than any release-then-Left-Alt chord a person can press.
 */
export const RIGHT_ALT_LATCH_MS = 30;

/** Wrap a raw Right Alt probe so a press stays observed for {@link RIGHT_ALT_LATCH_MS}. */
export function createRightAltLatch(isDownNow: () => boolean, now: () => number): () => boolean {
	let lastSeenDown = Number.NEGATIVE_INFINITY;
	return () => {
		const at = now();
		if (isDownNow()) {
			lastSeenDown = at;
			return true;
		}
		return at - lastSeenDown <= RIGHT_ALT_LATCH_MS;
	};
}

const win32Host: AltGrHost = {
	activeLayer: () => EMPTY_LAYER,
	isRightAltDown: () => false,
};

/**
 * Translate a kitty CSI-u Alt/Ctrl+Alt chord into the text AltGr produced, or
 * `undefined` when the sequence is not an AltGr keystroke on the active layout.
 *
 * Only call this on native Windows ConPTY hosts with the kitty protocol active.
 */
export function translateWindowsAltGrSequence(data: string, host: AltGrHost = win32Host): string | undefined {
	if (!data.endsWith("u")) return undefined;
	const parsed = parseKittySequence(data);
	if (!parsed || parsed.eventType === "release") return undefined;
	const modifier = parsed.modifier & ~KITTY_LOCK_MASK;
	// AltGr surfaces as Alt (fake LeftCtrl filtered) or Ctrl+Alt, optionally with Shift.
	if ((modifier & KITTY_MOD_ALT) === 0) return undefined;
	if ((modifier & ~(KITTY_MOD_ALT | KITTY_MOD_CTRL | KITTY_MOD_SHIFT)) !== 0) return undefined;
	// Functional keys (kitty PUA range) and C0 controls never carry AltGr text.
	if (parsed.codepoint < 0x20 || (parsed.codepoint >= 0xe000 && parsed.codepoint <= 0xf8ff)) return undefined;

	try {
		// Layouts without an AltGr layer (US, UK, ...) stop here: Alt chords stay shortcuts.
		const layer = host.activeLayer();
		if (layer.size === 0) return undefined;
		// Table keys are lowercased base characters; normalize hosts that report uppercase.
		const base = String.fromCodePoint(parsed.codepoint).toLowerCase().codePointAt(0)!;
		const text = layer.get(tableKey(base, (modifier & KITTY_MOD_SHIFT) !== 0));
		if (text === undefined) return undefined;
		// Left Alt+key shares the exact bytes; only a held Right Alt means AltGr.
		return host.isRightAltDown() ? text : undefined;
	} catch {
		return undefined;
	}
}
