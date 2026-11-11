# @cloud-pi/tui

一个从 [oh-my-pi](https://github.com/can1357/oh-my-pi) 的 TUI 中抽取出来的、自包含的
Node.js 终端 UI 库。它提供不可变帧渲染器、主题、组件、内联图片（Kitty / iTerm2）和终端
通知，不依赖 FFI、原生插件或 Bun 运行时。

- **Node.js 24+**，仅支持 ESM。
- **不可变渲染契约**：`render(width)` 返回 `readonly string[]`。每一行由组件拥有，
  渲染引擎不会修改它。
- **差分绘制**：同步输出、历史区与可变视口、覆盖层、尺寸变化重排，以及供宿主集成的
  绘制监听器。
- **纯 TypeScript 文本引擎**：ANSI 感知的宽度计算、换行、截断，以及 Kitty 键盘协议
  解析，无需原生绑定。

上游基线：oh-my-pi **v18.18.7**（`e325ffc73ab8`）。

## 安装

`@cloud-pi/tui` 尚未发布到 npm registry。在本 monorepo 内，直接按包名声明依赖，
npm 会链接到本地工作区包：

```json
{
	"dependencies": {
		"@cloud-pi/tui": "^0.1.0"
	}
}
```

在 monorepo 之外，从包目录安装：

```sh
npm install ../cloud-pi/packages/tui
```

该包发布由 `src/` 编译得到的 `dist/`；使用构建产物前，先在仓库根目录运行
`npm run build -w @cloud-pi/tui`。

## 快速开始

```ts
import { ProcessTerminal, Text, TUI } from "@cloud-pi/tui";

const terminal = new ProcessTerminal();
const tui = new TUI(terminal);

tui.addChild(new Text("Hello from @cloud-pi/tui", 1, 1));
tui.start();

process.on("SIGINT", () => {
	tui.stop();
	process.exit(0);
});
```

`TUI.start()` 启动终端、开启原始输入并调度首帧绘制。`TUI.stop()` 恢复终端状态。
组件通过 `addChild()` / `removeChild()` 添加（或构造进 `Container`）；内容发生变化的
组件必须调用 `invalidate()`（或从 `render` 返回新数组），渲染引擎才会重绘。

### 输入与焦点

```ts
const tui = new TUI(new ProcessTerminal());
const unsubscribe = tui.addInputListener(data => {
	if (data === "q") {
		tui.stop();
		return { consume: true };
	}
	return undefined;
});

tui.addChild(editor);
tui.setFocus(editor); // editor 实现 handleInput
tui.start();
```

`setFocus()` 将输入路由到可聚焦组件；监听器可以在序列到达焦点组件之前消费它。
`tui.start({ deferInput: true })` 会先绘制，同时让 stdin 保持 cooked 模式，直到调用
`tui.enableInput()`。

### 覆盖层

```ts
const overlay = tui.showOverlay(new Text("Confirm?", 1, 1), {
	anchor: "center",
	width: 30,
});
overlay.hide();
```

`row` / `col` 接受绝对单元格偏移或百分比字符串；`anchor` 相对于覆盖层自身尺寸定位。

## 主题

主题使用进程级单例，与 oh-my-pi 的行为一致。内置主题为 `dark` 和 `light`；自定义主题
从用户主题目录加载。

```ts
import { Text } from "@cloud-pi/tui";
import { getThemeByName } from "@cloud-pi/tui/theme";

const theme = await getThemeByName("dark");
const label = new Text("", 1, 1).setStyleFn(text => theme!.fg("accent", text));
label.setText("Accent text");
```

- `Theme.fg(color, text)` / `Theme.bg(color, text)` 返回带 ANSI 包装的字符串；
  `getFgAnsi()` / `getBgAnsi()` 返回原始转义码。
- 彩色 Markdown 默认开启：标题、粗体/斜体、行内代码和表头从主题的 16 槽
  `terminal.ansi` 调色板取色（`Theme.ansiFg(slot, text)`）。
  `setMarkdownColorful(false)` 恢复单一标题色和普通粗体/斜体。
- `initTheme()`、`setTheme()`、`previewTheme()` 和 `onThemeChange()` 管理当前活动的
  主题单例。
- 主题颜色键（accent、border、mdHeading、syntaxKeyword 等）列在
  `src/theme/schema-validation.ts` 中，并在加载时校验。

### 语法高亮

高亮是可插拔的，且默认关闭。在宿主安装引擎之前，`Markdown` 和 `highlightCode()` 只渲染
纯文本：

```ts
import { setHighlighter } from "@cloud-pi/tui/theme";

setHighlighter({
	supportsLanguage: lang => lang === "ts",
	highlightCode: (code, lang, colors) => {
		// colors.keyword/comment/string/... 是来自主题的 ANSI SGR 字符串
		return myHighlighter(code, lang, colors);
	},
});
```

## 组件

从 `@cloud-pi/tui/components`（以及 `@cloud-pi/tui`）导出：

`Text`、`Box`、`Container`、`Input`、`Editor`、`Form` / `FormField`、
`Markdown`、`Loader`、`CancellableLoader`、`ProgressBar`、`Table`、`Sparkline`、
`SelectList`、`SettingsList`、`TreeView`、`TruncatedText`、`KeyValueList`、
`Section`、`TabBar`、`Spacer`、`Metric`、`WizardStep`、`Image`，以及
`components/layout` 中的布局容器。

每个组件都实现：

```ts
interface Component {
	render(width: number): readonly string[];
	invalidate?(): void;
	handleInput?(data: string): void;
}
```

`setFocus()` 期望一个 `Focusable`：即任何带有 `focused` 布尔属性的组件。

工具输出与代码单元的渲染器位于 `@cloud-pi/tui/render`（`renderOutputBlock`、
`formatOutputPaneLines`、`renderCodeCell`、`renderFileList`、`renderTreeList`、
`renderToolCard`，以及超链接辅助函数）。

## 图片

支持 Kitty 和 iTerm2 内联图片协议；不支持 SIXEL。协议检测来自环境变量和终端应答，
可通过 `setTerminalImageProtocol()` 覆盖。

```ts
import { readFile } from "node:fs/promises";
import { Image, getImageDimensions } from "@cloud-pi/tui";
import { getThemeByName } from "@cloud-pi/tui/theme";

const bytes = await readFile("logo.png");
const data = bytes.toString("base64");
const theme = await getThemeByName("dark");
const image = new Image(
	data,
	"image/png",
	{ fallbackColor: text => theme!.fg("muted", text) },
	{ maxWidthCells: 40, filename: "logo.png" },
);
```

`ImageBudget` 限制同时以实时图形方式渲染的图片数量；其余图片回退为主题化的文本占位符。
更底层的辅助函数（`renderImage`、`encodeKittyTransmit`、`encodeITerm2`、
`getPngDimensions` 等）从 `@cloud-pi/tui/image` 导出。

## 通知

```ts
import { getTerminalInfo, TERMINAL_ID } from "@cloud-pi/tui";

getTerminalInfo(TERMINAL_ID).sendNotification({
	title: "Build",
	body: "Finished in 12s",
});
```

通知根据终端能力使用 OSC 9、OSC 99 或 BEL。`routeTerminalMultiplexerNotification()`
在 tmux、screen、zellij 等复用器会吞掉序列时进行转发。在 Linux 桌面会话中，
`sendDesktopNotification()` 回退到 `notify-send` / `gdbus`。
`isNotificationSuppressed()` 和 `setOsc99Supported()` 控制投递行为。

## 按键

`@cloud-pi/tui/keys` 导出 `matchesKey`、`parseKey`、`Key`、`parseKittySequence`、
`isKeyRelease`、`decodePrintableKey`，以及 Kitty 协议状态设置函数。同时支持传统 VT
序列和 Kitty 键盘协议。

## 子路径导出

| 说明符 | 内容 |
| --- | --- |
| `@cloud-pi/tui` | 核心 TUI、终端、组件、主题、按键、工具函数 |
| `@cloud-pi/tui/theme` | 主题单例、加载器、适配器、`setHighlighter` |
| `@cloud-pi/tui/components` | 仅组件 |
| `@cloud-pi/tui/render` | 输出/代码/工具渲染辅助与超链接 |
| `@cloud-pi/tui/image` | `Image`、Kitty graphics、图片编码/尺寸 |
| `@cloud-pi/tui/notifications` | 通知协议、路由、桌面提示 |
| `@cloud-pi/tui/multiplexers` | tmux、screen、zellij、cmux、herdr、orca、wmux 适配器 |
| `@cloud-pi/tui/keys` | 按键匹配/解析 |

## 与 oh-my-pi 的差异

- **没有 Tern Surface Protocol（TSP）**：移除了原生 `describe()` 表面、原生
  overlays/sheets 和原生 UI 事件；`render()` 是唯一契约。
- **没有 SIXEL**。
- **没有 FFI / 原生插件**：文本与按键引擎为纯 JS；Windows AltGr 没有布局层；stderr
  fd 守卫为空操作；macOS 外观检测通过调用 `defaults` 完成。
- **不依赖 Bun 运行时**：一个小型 shim 提供源码使用的 `Bun` API，并在构建时注入。
- **不含 CLI 产品模块**：apps、聊天记录、工具渲染器、overlays、状态栏、初始化向导和
  调试服务器均未包含。
- **高亮可插拔**：不内置语法高亮引擎。

`src/` 下的 TypeScript 文件带有 verbatim/adapted/new 来源头。JSON 来源及完整清单见
[SOURCES.json](./SOURCES.json)。本地差异与同步历史见 [PATCHES.md](./PATCHES.md)。

Mermaid 代码块使用纯 TypeScript 的 `beautiful-mermaid` 渲染器，支持流程图、状态图、
时序图、类图、ER 图和 XY 图。不支持的语法回退为代码；布局可能与上游 Rust 渲染器不同。

## 开发

```sh
npm install
npm run typecheck -w @cloud-pi/tui   # tsc --noEmit
npm run build -w @cloud-pi/tui       # tsup (ESM + d.ts, 8 entry points)
npm run test -w @cloud-pi/tui        # Vitest over src/
npm run test:dist -w @cloud-pi/tui   # tracked tests in test/bundle/
npm run verify                       # all of the above
npm run audit:upstream -w @cloud-pi/tui # pinned source/header comparison
```

`test/setup.ts` 将 Bun shim 安装到 `globalThis`，使 vendored 源码无需修改即可在
Vitest 下运行。来源审计需要相邻的 oh-my-pi 与 pi Git 仓库，也可设置 `OH_MY_PI_DIR`
和 `PI_DIR`。测试使用纯 Node：即使未安装 Bun 也必须通过。

## 许可证

MIT。@cloud-pi/tui 派生自 oh-my-pi 与 pi；参见
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) 和 [LICENSE](./LICENSE)。
