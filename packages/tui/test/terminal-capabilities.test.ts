import { describe, expect, it } from "vitest";
import { detectKittyUnicodePlaceholdersSupport } from "../src/kitty-graphics";
import {
	calculateImageRows,
	detectRectangularSgrSupport,
	detectStyledUnderlineSupport,
	detectTerminalId,
	encodeITerm2,
	encodeKittyTransmit,
	getPngDimensions,
	getTerminalInfo,
	hyperlinksUserOverride,
	ImageProtocol,
	isPaseoEmbedder,
	isSshSession,
	NotifyProtocol,
	resolveImageProtocol,
	resolveWarpImageProtocol,
	shouldEnableSynchronizedOutputByDefault,
	synchronizedOutputUserOverride,
} from "../src/terminal-capabilities";

describe("detectTerminalId", () => {
	it("maps dedicated session markers", () => {
		expect(detectTerminalId({ KITTY_WINDOW_ID: "1" } as NodeJS.ProcessEnv)).toBe("kitty");
		expect(detectTerminalId({ GHOSTTY_RESOURCES_DIR: "/x" } as NodeJS.ProcessEnv)).toBe("ghostty");
		expect(detectTerminalId({ WEZTERM_PANE: "2" } as NodeJS.ProcessEnv)).toBe("wezterm");
		expect(detectTerminalId({ ITERM_SESSION_ID: "w0t0p0" } as NodeJS.ProcessEnv)).toBe("iterm2");
		expect(detectTerminalId({ VSCODE_PID: "42" } as NodeJS.ProcessEnv)).toBe("vscode");
	});

	it("maps TERM_PROGRAM case-insensitively", () => {
		expect(detectTerminalId({ TERM_PROGRAM: "Kitty" } as NodeJS.ProcessEnv)).toBe("kitty");
		expect(detectTerminalId({ TERM_PROGRAM: "iTerm.app" } as NodeJS.ProcessEnv)).toBe("iterm2");
		expect(detectTerminalId({ TERM_PROGRAM: "WarpTerminal" } as NodeJS.ProcessEnv)).toBe("warp");
		expect(detectTerminalId({ TERM_PROGRAM: "unknown-app" } as NodeJS.ProcessEnv)).toBe("base");
	});

	it("trusts dedicated markers over TERM_PROGRAM", () => {
		expect(
			detectTerminalId({ KITTY_WINDOW_ID: "1", TERM_PROGRAM: "WezTerm" } as NodeJS.ProcessEnv),
		).toBe("kitty");
	});

	it("falls back to LC_TERMINAL but not inside a multiplexer", () => {
		expect(detectTerminalId({ LC_TERMINAL: "iTerm2" } as NodeJS.ProcessEnv)).toBe("iterm2");
		expect(detectTerminalId({ LC_TERMINAL: "iTerm2", TMUX: "/tmp/tmux,1,0" } as NodeJS.ProcessEnv)).not.toBe(
			"iterm2",
		);
	});

	it("prefers truecolor over the bare profile", () => {
		expect(detectTerminalId({ COLORTERM: "truecolor" } as NodeJS.ProcessEnv)).toBe("trueColor");
	});
});

describe("resolveImageProtocol", () => {
	it("reports the protocol each known terminal implements", () => {
		expect(resolveImageProtocol("kitty", {} as NodeJS.ProcessEnv, true)).toBe(ImageProtocol.Kitty);
		expect(resolveImageProtocol("iterm2", {} as NodeJS.ProcessEnv, true)).toBe(ImageProtocol.Iterm2);
		expect(resolveImageProtocol("vscode", {} as NodeJS.ProcessEnv, true)).toBeNull();
	});

	it("suppresses Kitty graphics inside a Paseo pane", () => {
		expect(isPaseoEmbedder({ PASEO_TERMINAL_ID: "p" } as NodeJS.ProcessEnv)).toBe(true);
		expect(resolveImageProtocol("kitty", { PASEO_TERMINAL_ID: "p" } as NodeJS.ProcessEnv, true)).toBeNull();
	});

	it("drops Kitty graphics on a Windows Warp host", () => {
		expect(resolveWarpImageProtocol("win32", {} as NodeJS.ProcessEnv)).toBeNull();
		expect(resolveWarpImageProtocol("darwin", {} as NodeJS.ProcessEnv)).toBe(ImageProtocol.Kitty);
	});
});

describe("capability defaults", () => {
	it("gates rectangular SGR on terminal identity and DECCARA opt-out", () => {
		expect(detectRectangularSgrSupport("kitty", {} as NodeJS.ProcessEnv)).toBe(true);
		expect(detectRectangularSgrSupport("ghostty", {} as NodeJS.ProcessEnv)).toBe(false);
		expect(detectRectangularSgrSupport("kitty", { PI_NO_DECCARA: "1" } as NodeJS.ProcessEnv)).toBe(false);
	});

	it("gates styled underlines on confirmed terminal versions", () => {
		expect(detectStyledUnderlineSupport("kitty", {} as NodeJS.ProcessEnv)).toBe(true);
		expect(
			detectStyledUnderlineSupport("iterm2", { TERM_PROGRAM_VERSION: "3.4.20" } as NodeJS.ProcessEnv),
		).toBe(false);
		expect(
			detectStyledUnderlineSupport("iterm2", { TERM_PROGRAM_VERSION: "3.5.0" } as NodeJS.ProcessEnv),
		).toBe(true);
		expect(detectStyledUnderlineSupport("kitty", { TMUX: "/tmp/tmux,1,0" } as NodeJS.ProcessEnv)).toBe(false);
	});

	it("resolves synchronized-output policy from overrides, features and identity", () => {
		expect(synchronizedOutputUserOverride({ PI_NO_SYNC_OUTPUT: "1" } as NodeJS.ProcessEnv)).toBe(false);
		expect(synchronizedOutputUserOverride({ PI_FORCE_SYNC_OUTPUT: "1" } as NodeJS.ProcessEnv)).toBe(true);
		expect(synchronizedOutputUserOverride({} as NodeJS.ProcessEnv)).toBeNull();

		expect(shouldEnableSynchronizedOutputByDefault({} as NodeJS.ProcessEnv, "kitty")).toBe(true);
		expect(shouldEnableSynchronizedOutputByDefault({} as NodeJS.ProcessEnv, "base")).toBe(false);
		expect(shouldEnableSynchronizedOutputByDefault({ TMUX: "/tmp/tmux,1,0" } as NodeJS.ProcessEnv, "kitty")).toBe(
			false,
		);
		expect(
			shouldEnableSynchronizedOutputByDefault({ PI_FORCE_SYNC_OUTPUT: "1", TMUX: "/tmp/tmux,1,0" } as NodeJS.ProcessEnv, "kitty"),
		).toBe(true);
	});

	it("lets a hyperlink opt-out win over the force-on switch", () => {
		expect(hyperlinksUserOverride({ PI_NO_HYPERLINKS: "1", PI_FORCE_HYPERLINKS: "1" } as NodeJS.ProcessEnv)).toBe(
			false,
		);
		expect(hyperlinksUserOverride({ PI_FORCE_HYPERLINKS: "1" } as NodeJS.ProcessEnv)).toBe(true);
	});

	it("detects SSH sessions from any marker", () => {
		expect(isSshSession({ SSH_CONNECTION: "1 2 3 4" } as NodeJS.ProcessEnv)).toBe(true);
		expect(isSshSession({} as NodeJS.ProcessEnv)).toBe(false);
	});
});

describe("image encoding", () => {
	it("reads PNG dimensions from the IHDR header", () => {
		const buffer = Buffer.alloc(24);
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
		buffer.writeUInt32BE(3, 16);
		buffer.writeUInt32BE(5, 20);
		expect(getPngDimensions(buffer.toString("base64"))).toEqual({ widthPx: 3, heightPx: 5 });
		expect(getPngDimensions(Buffer.from("not a png").toString("base64"))).toBeNull();
	});

	it("wraps Kitty transmissions in APC chunks with the requested id", () => {
		const encoded = encodeKittyTransmit("AAAA", 42);
		expect(encoded.startsWith("\x1b_G")).toBe(true);
		expect(encoded.endsWith("\x1b\\")).toBe(true);
		expect(encoded).toContain("a=t,f=100,q=2,i=42");
		expect(encoded).toContain("AAAA");
	});

	it("encodes iTerm2 inline images with base64 metadata", () => {
		const encoded = encodeITerm2("AAAA", { name: "a.png", width: "10", height: "auto" });
		expect(encoded.startsWith("\x1b]1337;File=inline=1;")).toBe(true);
		expect(encoded).toContain(`name=${Buffer.from("a.png").toString("base64")}`);
		expect(encoded.endsWith(":AAAA\x07")).toBe(true);
	});

	it("computes image rows from cell geometry", () => {
		expect(
			calculateImageRows({ widthPx: 90, heightPx: 180 }, 10, { widthPx: 9, heightPx: 18 }),
		).toBe(10);
		expect(calculateImageRows({ widthPx: 10, heightPx: 1 }, 1, { widthPx: 9, heightPx: 18 })).toBe(1);
	});
});

describe("terminal notifications", () => {
	it("formats OSC 9, OSC 99 and BEL payloads per protocol", () => {
		expect(getTerminalInfo("ghostty").formatNotification("done")).toBe("\x1b]9;done\x1b\\");
		expect(getTerminalInfo("kitty").formatNotification("done")).toBe("\x1b]99;;done\x1b\\");
		expect(getTerminalInfo("base").formatNotification("done")).toBe(NotifyProtocol.Bell);
	});

	it("assigns notification protocols to known terminals", () => {
		expect(getTerminalInfo("ghostty").notifyProtocol).toBe(NotifyProtocol.Osc9);
		expect(getTerminalInfo("kitty").notifyProtocol).toBe(NotifyProtocol.Osc99);
		expect(getTerminalInfo("vscode").notifyProtocol).toBe(NotifyProtocol.Bell);
	});
});

describe("detectKittyUnicodePlaceholdersSupport", () => {
	const env = {} as NodeJS.ProcessEnv;

	it("enables placeholders only for terminals that advertise them", () => {
		expect(detectKittyUnicodePlaceholdersSupport("tern", env)).toBe(true);
		expect(detectKittyUnicodePlaceholdersSupport("wezterm", env)).toBe(false);
	});

	it("keeps the explicit opt-out above terminal detection", () => {
		expect(
			detectKittyUnicodePlaceholdersSupport("tern", { PI_NO_KITTY_PLACEHOLDERS: "1" } as NodeJS.ProcessEnv),
		).toBe(false);
	});
});
