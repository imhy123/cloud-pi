import {
	CombinedAutocompleteProvider,
	Container,
	Editor,
	getEditorTheme,
	initTheme,
	matchesKey,
	onTerminalAppearanceChange,
	onThemeChange,
	ProcessTerminal,
	startMacOSAppearanceReprobeFallback,
	Text,
	theme,
	TUI,
} from "@cloud-pi/tui";

import { createClientLocale } from "./i18n/locale";
import { ClientSettings } from "./settings/store";
import { SettingsController } from "./settings/controller";
import { SettingsSelectorComponent } from "./tui/components/settings-selector";
import { buildClientSlashCommands } from "./slash-commands/builtin-client";
import { createBuiltinSlashCommandRegistry } from "./slash-commands/builtin-registry";
import type { SlashCommandRuntime } from "./slash-commands/types";
import { VERSION } from "./version";
import { Welcome } from "./tui/components/welcome";

export async function startClient(options: { language?: string } = {}): Promise<void> {
	const settings = new ClientSettings();
	await settings.load();
	const locale = createClientLocale(options.language ?? settings.language);

	// omp's default dark theme; its accent (electricBlue #00b4ff) is the color omp
	// paints the editor border with, so the client selects it for a matching frame.
	// The light mapping is what a white-background terminal gets after detection.
	// `true` also arms the SIGWINCH/macOS appearance observers.
	await initTheme(true, undefined, undefined, settings.darkTheme ?? "titanium", settings.lightTheme ?? "light");

	// The second argument draws the caret with the terminal's hardware cursor, so
	// no cursor glyph is printed into scrollback on exit.
	const terminal = new ProcessTerminal();
	const tui = new TUI(terminal, true);
	// Text comes from the catalog; `locale` reads the system's languages and
	// selects the language at startup.
	const welcome = new Welcome({
		version: `v${VERSION}`,
		tipLabel: locale.t("welcome.tipLabel"),
		tip: locale.t("welcome.tip"),
	});
	const transcript = new Container();
	const editor = new Editor(getEditorTheme());

	tui.addChild(welcome);
	tui.addChild(transcript);
	tui.addChild(editor);
	tui.setFocus(editor);

	/**
	 * Mirror omp's editor border recolor (`updateEditorBorderColor`): omp derives
	 * the frame color from the session accent or thinking level. The client has
	 * neither, so it pins the frame to the theme accent — titanium `electricBlue`,
	 * the color omp records for its own border.
	 */
	function updateEditorBorderColor(): void {
		editor.borderColor = text => theme.fg("accent", text);
	}

	editor.setBorderStyle("claude");
	updateEditorBorderColor();

	// Follow the terminal's light/dark appearance. The terminal replays an already
	// detected report to late subscribers, so subscribing before `tui.start()` still
	// sees the startup OSC 11 reply; Mode 2031 keeps it current afterwards.
	terminal.onAppearanceChange(mode => onTerminalAppearanceChange(mode));
	// macOS appearance polling, only engaged where the OSC 11 report is untrusted.
	const stopAppearanceFallback = startMacOSAppearanceReprobeFallback(terminal);
	onThemeChange(() => {
		// Theme loading is async and frames are cached (the banner keys its lines on
		// width), so drop caches or they keep the previous palette.
		welcome.invalidate();
		tui.invalidate();
		tui.requestRender(true);
	});

	welcome.playIntro(() => tui.requestRender());

	// Command descriptions are localized once at startup; language settings take
	// effect for the command menu after restarting the client.
	const commands = createBuiltinSlashCommandRegistry(buildClientSlashCommands(locale.t));
	editor.setAutocompleteProvider(new CombinedAutocompleteProvider(commands.buildTuiBuiltinSlashCommands()));

	function quit(): void {
		welcome.stopIntro();
		stopAppearanceFallback();
		tui.stop();
		process.exit(0);
	}

	const commandRuntime: SlashCommandRuntime = {
		clearTranscript() {
			transcript.clear();
			tui.requestRender();
		},
		showSettings() {
			let overlay: ReturnType<TUI["showOverlay"]>;
			const controller = new SettingsController(settings, locale.language);
			const selector = new SettingsSelectorComponent(
				controller,
				() => terminal.rows,
				() => tui.requestRender(),
				() => {
					selector.dispose();
					overlay.hide();
				},
			);
			overlay = tui.showOverlay(selector, { fullscreen: true, anchor: "top-left", width: "100%", maxHeight: "100%" });
		},
		quit,
	};

	editor.onSubmit = text => {
		const result = commands.executeBuiltinSlashCommand(text, commandRuntime);
		if (result === true) return;
		transcript.addChild(new Text(locale.t("chat.youSaid", typeof result === "string" ? result : text), 1, 0));
		tui.requestRender();
	};

	tui.addInputListener(data => {
		if (matchesKey(data, "ctrl+c")) quit();
		return undefined;
	});

	tui.start();
}
