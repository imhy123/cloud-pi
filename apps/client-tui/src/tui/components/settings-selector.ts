// cloud-pi client-tui: adapted from oh-my-pi packages/tui/src/overlays/settings-selector.ts
// (commit e325ffc73ab8; v18.18.7). Fullscreen frame, tabs, grouped list and
// search are adapted to controller-provided client definitions; native and
// product-specific functionality is omitted. See ../../../PATCHES.md.
import {
	getSelectListTheme,
	getSettingsListTheme,
	matchesKey,
	parseSgrMouse,
	SelectList,
	SettingsList,
	TabBar,
	theme,
	truncateToWidth,
	visibleWidth,
	type Component,
	type SettingItem,
} from "@cloud-pi/tui";
import type { LocalizedText } from "@cloud-pi/common";
import type { ClientLocale } from "../../i18n/locale";
import type { SettingDefinition, SettingsCategory, SettingOption } from "../../settings/definitions";

/** Presentation contract; the host owns persistence and setting effects. */
export interface SettingsSelectorModel {
	readonly categories: readonly SettingsCategory[];
	readonly t: ClientLocale["t"];
	readonly loadError: string | undefined;
	localize(text: LocalizedText): string;
	errorText(error: unknown): string;
	value(item: SettingDefinition): string;
	displayValue(item: SettingDefinition): string;
	choices(item: SettingDefinition, signal: AbortSignal): Promise<readonly SettingOption[]>;
	save(item: SettingDefinition, value: string): Promise<string>;
}

export class SettingsSelectorComponent implements Component {
	readonly #tabs: TabBar;
	#list: SettingsList;
	#notice: string;
	#pending = false;
	#tab: string;
	#contentStart = 3;
	#optionsRequest?: AbortController;

	constructor(
		private readonly controller: SettingsSelectorModel,
		private readonly rows: () => number,
		private readonly requestRender: () => void,
		private readonly done: () => void,
	) {
		this.#notice = controller.loadError ?? "";
		this.#tab = controller.categories[0]?.id ?? "";
		const labels = controller.categories.map(category => ({
			id: category.id,
			label: controller.localize(category.label),
		}));
		this.#tabs = new TabBar("", labels, {
			label: text => text,
			activeTab: text => theme.bold(theme.fg("accent", text)),
			inactiveTab: text => theme.fg("muted", text),
			hint: text => theme.fg("dim", text),
		});
		this.#tabs.showHint = false;
		this.#tabs.onTabChange = tab => {
			this.#tab = tab.id;
			this.#list = this.#createList();
			this.requestRender();
		};
		this.#list = this.#createList();
	}

	#pick(item: SettingDefinition, done: (value?: string) => void): Component {
		this.#optionsRequest?.abort();
		const request = new AbortController();
		this.#optionsRequest = request;
		let list: SelectList | undefined;
		let status = this.controller.t("settings.loading");
		const finish = (value?: string) => {
			request.abort();
			done(value);
		};
		const apply = (options: readonly SettingOption[]) => {
			if (request.signal.aborted) return;
			if (options.length === 0) {
				status = this.controller.t("settings.empty");
				this.requestRender();
				return;
			}
			list = new SelectList(options.map(option => ({
				value: option.value,
				label: this.controller.localize(option.label),
				description: option.description ? this.controller.localize(option.description) : undefined,
			})), Math.max(2, Math.min(options.length, this.rows() - 10)), getSelectListTheme(), { search: "never" });
			list.setSelectedValue(this.controller.value(item));
			list.onSelect = option => finish(option.value);
			list.onCancel = () => finish();
			this.requestRender();
		};
		if (item.options?.source === "static") apply(item.options.items);
		else void this.controller.choices(item, request.signal).then(apply, error => {
			if (request.signal.aborted) return;
			status = this.controller.t("settings.optionsError", this.controller.errorText(error));
			this.requestRender();
		});
		return {
			invalidate() {},
			render: width => list?.render(width) ?? [truncateToWidth(status, width)],
			handleInput: data => {
				if (matchesKey(data, "escape")) finish();
				else list?.handleInput(data);
			},
			routeMouse: (event: import("@cloud-pi/tui").SgrMouseEvent, line: number, col: number) => list?.routeMouse(event, line, col),
		} as Component;
	}

	dispose(): void {
		this.#optionsRequest?.abort();
	}

	#items(): SettingItem[] {
		const category = this.controller.categories.find(item => item.id === this.#tab);
		if (!category) return [];
		const result: SettingItem[] = [];
		for (const group of category.groups) {
			result.push({
				id: `group:${group.id}`,
				label: this.controller.localize(group.label),
				currentValue: "",
				heading: true,
			});
			for (const item of group.items) {
				const description = this.controller.localize(item.description);
				const row: SettingItem = {
					id: item.id,
					label: this.controller.localize(item.label),
					currentValue: this.controller.displayValue(item),
					description: item.type === "mock"
						? `${this.controller.t("settings.mock")} ${description}`
						: description,
				};
				if (item.type !== "mock") {
					row.submenu = (_current, done) => this.#pick(item, done);
				}
				result.push(row);
			}
		}
		return result;
	}

	#findItem(id: string): SettingDefinition | undefined {
		return this.controller.categories
			.flatMap(category => category.groups)
			.flatMap(group => group.items)
			.find(item => item.id === id);
	}

	#createList(): SettingsList {
		const t = this.controller.t;
		return new SettingsList(this.#items(), 8, getSettingsListTheme(), (id, value) => {
			const item = this.#findItem(id);
			if (!item) return;
			this.#pending = true;
			void this.controller.save(item, value).then(notice => {
				this.#notice = notice;
			}, error => {
				this.#notice = t("settings.error", this.controller.errorText(error));
			}).finally(() => {
				this.#pending = false;
				this.#list.setItems(this.#items());
				this.requestRender();
			});
		}, this.done, {
			layout: "auto",
			emptyText: t("settings.empty"),
			hint: "",
			searchText: {
				prompt: t("settings.searchEmpty"),
				active: query => t("settings.search", query),
				noMatches: t("settings.noMatches"),
				editHelp: t("settings.searchHelp"),
			},
		});
	}

	invalidate(): void {
		this.#list.invalidate();
	}

	render(width: number): readonly string[] {
		const height = Math.max(1, this.rows());
		const inner = Math.max(1, width - 4);
		const box = theme.boxRound;
		const horizontal = (left: string, right: string) =>
			theme.fg("border", left + box.horizontal.repeat(Math.max(0, width - 2)) + right);
		const row = (line: string) => {
			const text = truncateToWidth(line, inner);
			const padding = " ".repeat(Math.max(0, inner - visibleWidth(text)));
			return theme.fg("border", box.vertical) + " " + text + padding + " " + theme.fg("border", box.vertical);
		};
		const title = ` ${this.controller.t("settings.title")} `;
		const top = theme.fg("border", box.topLeft + box.horizontal)
			+ theme.bold(theme.fg("accent", title))
			+ theme.fg("border", box.horizontal.repeat(Math.max(0, width - 3 - visibleWidth(title))) + box.topRight);
		const tabs = this.#tabs.render(inner);
		this.#contentStart = 1 + tabs.length + 1;
		const contentRows = Math.max(1, height - (this.#contentStart + 3));
		this.#list.setMaxVisible(Math.max(1, contentRows - 5));
		const list = this.#list.render(inner);
		const content = Array.from({ length: contentRows }, (_, index) => row(list[index] ?? ""));
		if (this.#notice && content.length) {
			content[content.length - 1] = row(theme.fg("warning", this.#notice));
		}
		return [
			top,
			...tabs.map(row),
			horizontal(box.teeRight, box.teeLeft),
			...content,
			horizontal(box.teeRight, box.teeLeft),
			row(theme.fg("dim", this.controller.t("settings.tabHint"))),
			horizontal(box.bottomLeft, box.bottomRight),
		].slice(0, height);
	}

	handleInput(data: string): void {
		if (this.#pending) return;
		const mouse = parseSgrMouse(data);
		if (mouse) {
			const onTabRow = !this.#list.hasOpenSubmenu()
				&& mouse.row >= 1
				&& mouse.row < this.#contentStart - 1;
			const tab = onTabRow ? this.#tabs.tabAt(mouse.row - 1, mouse.col - 2) : undefined;
			if (tab && mouse.leftClick) {
				this.#tabs.selectTab(tab.id);
				this.requestRender();
				return;
			}
			if (mouse.motion) this.#tabs.setHoverTab(tab?.id ?? null);
			const line = mouse.row - this.#contentStart;
			const col = mouse.col - 2;
			if (this.#list.routeSubmenuMouse(mouse, line, col)) {
				// The open submenu owns its input.
			} else if (mouse.wheel !== null) {
				this.#list.handleWheelAt(mouse.wheel, line, col);
			} else if (mouse.motion) {
				this.#list.setHoverItem(this.#list.hoverTest(line, col) ?? null);
			} else if (mouse.leftClick) {
				const id = this.#list.hitTest(line, col);
				if (id && this.#list.selectItem(id)) this.#list.handleInput("\r");
			}
		} else if (
			!this.#list.hasOpenSubmenu()
			&& (matchesKey(data, "tab") || matchesKey(data, "shift+tab")
				|| matchesKey(data, "left") || matchesKey(data, "right"))
		) {
			this.#tabs.handleInput(data);
		} else {
			this.#list.handleInput(data);
		}
		this.requestRender();
	}
}
