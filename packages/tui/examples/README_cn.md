# @cloud-pi/tui 示例

面向 `@cloud-pi/tui` 的手把手示例编写指南。

本目录为下面每个步骤都提供了可运行 demo，另有 `11-welcome/` 横幅示例。教程沿用
cloud-pi 仓库中 pi-tui 教程（`demo/pi-tui/README_cn.md`）的结构，但使用
`@cloud-pi/tui` 的实际 API，因此大多数从 pi-tui 复制过来的代码片段不能直接运行。

## 0. 准备工作

### 0.1 无需安装或构建

示例导入 `@cloud-pi/tui` 时会解析到 `src/`，而不是 `dist/`：

```bash
# 在仓库根目录执行
npm install
cd packages/tui/examples
npm run 01-hello   # node --import ./register.mjs 01-hello/hello.ts
```

`package.json` 和本 README 旁边的三个小文件让这一切成立：

- `register.mjs` —— 通过 `--import` 预加载。它注册 loader，并把 `globalThis.Bun`
  设为 tsup 注入 bundle 的同一个 shim。
- `ts-loader.mjs` —— 一对 `module.registerHooks()`。`resolve` 把 `@cloud-pi/tui`
  和 `@cloud-pi/tui/<子路径>` 映射到 `src/`，映射 `@oh-my-pi/*` 构建别名，并补上
  源码省略的 `.ts` / `/index.ts` 扩展名。`load` 用仓库自带的 TypeScript 转译
  `.ts`：Node 26 只擦除类型，不再转换 enum，而源码用到了 enum。
- `tsconfig.json` —— 为 tsserver/vtsls 映射同样的说明符，让编辑器与运行时一致。

不涉及构建步骤，也不依赖 `file:..`。只有当有消费方读取 `dist/`（发布包、
`test/bundle`）时才需要 `npm run build`；源码改动在下次运行 demo 时生效。

### 0.2 环境要求

**Node.js 24+**；本包仅支持 ESM，`examples/package.json` 已声明
`"type": "module"`。demo 是 TypeScript，必须通过
`node --import ./register.mjs <file>.ts` 启动，loader 才会生效。

### 0.3 常见坑

**1. `package.json` 必须声明 ESM。** 缺少 `"type": "module"` 时，Node 会报
`MODULE_TYPELESS_PACKAGE_JSON`，或拒绝这些导入。

**2. 类型要用 `import type`，运行时的值不用。** Node 的类型擦除只删除显式标记为
类型的导入。`TUI`、`ProcessTerminal`、`Text`、`Editor` 是运行时类；
`Component`、`EditorTheme`、`Focusable`、`SelectItem`、`MarkdownTheme`、
`OverlayHandle` 是运行时并不存在的接口：

```ts
// 运行时值
import { Editor, ProcessTerminal, Text, TUI } from "@cloud-pi/tui";
// 类型
import type { Component, Focusable } from "@cloud-pi/tui";
```

**3. `Editor` 接收的是主题，不是 `TUI`。** pi-tui 的 `new Editor(tui, theme)`
签名在这里不存在。@cloud-pi/tui 会把单例主题适配成编辑器主题：

```ts
import { Editor, getEditorTheme, initTheme } from "@cloud-pi/tui";

await initTheme();
const editor = new Editor(getEditorTheme());
```

`getEditorTheme()` 有无样式的兜底实现，但想要真实配色，必须先调用
`initTheme()`（或 `initThemeSync()`）。构造函数没有可选的主题参数，
`new Editor(undefined)` 是类型错误。

**4. `addInputListener` 必须返回结果。** 回调类型是
`{ consume?: boolean; data?: string } | undefined`。只做事情、不返回值的函数体
返回 `void`，无法通过类型检查；在结尾写 `return undefined;`（或返回
`{ consume: true }` 阻止继续传递）。

**5. demo 里可以使用 TypeScript 专有语法。** loader 会转译每个 `.ts` 文件，所以
enum、参数属性和 `namespace` 都能在示例代码中使用：

```ts
class Picker {
	constructor(private readonly tui: TUI) {}
}
```

直接用 `node demo.ts`（不带 `--import ./register.mjs`）会退回 Node 的仅擦除模式并
拒绝这些语法；本目录不支持这种运行方式。

**6. `@types/node` 来自仓库安装。** `process` 是 Node 全局对象，没有类型也能运行；
但缺少类型时 tsserver/vtsls 会报 `Cannot find name 'process'`。
`examples/tsconfig.json` 会从上级 `node_modules` 取用，无需本地安装。

**7. `start()` 面向真实的 TTY。** 只有当 stdin 提供 `setRawMode` 时才会开启原始模式；
stdin 被管道接管时会跳过这一步，而转义序列仍会写到非终端的 stdout，因此管道运行得到
的是乱码而不是界面。如果只想确认代码能构造成功，可以停在
`new TUI(new ProcessTerminal())`，不要调用 `start()`。

**8. 原始模式下 Ctrl+C 不会产生 SIGINT。** 终端把字节原样交给应用，必须由应用自己
处理。在依赖 Ctrl+C 退出之前，先注册输入监听器（见 §1）。

**9. 必须显式请求重绘。** 添加、移除或修改组件不会自动调度渲染。先对内容变化的组件
调用 `invalidate()`，再调用 `tui.requestRender()`。组件本身不应直接写 `stdout`。

**10. 修改源码无需重新构建。** 示例直接读取 `src/`；重启 demo 即可生效。只有验证
`dist/` 时才需要 `npm run build`。

## 1. 最小应用

`01-hello/hello.ts`（随目录提供的 demo）：

```ts
import {
	Editor,
	getEditorTheme,
	initTheme,
	matchesKey,
	ProcessTerminal,
	Text,
	TUI,
} from "@cloud-pi/tui";

await initTheme();

// 第二个参数：用终端硬件光标绘制插入符，而不是把光标字形画进帧里，
// 否则退出后它会留在终端回滚记录中。
const tui = new TUI(new ProcessTerminal(), true);

tui.addChild(new Text("Welcome to @cloud-pi/tui!", 1, 1));

const editor = new Editor(getEditorTheme());
editor.onSubmit = (text) => {
	tui.addChild(new Text(`You said: ${text}`, 1, 0));
	tui.requestRender();
};
tui.addChild(editor);
tui.setFocus(editor); // 把键盘输入路由到编辑器

// 原始模式下 Ctrl+C 作为输入到达，不会产生 SIGINT。回调类型要求返回值，
// void 不兼容。
tui.addInputListener((data) => {
	if (matchesKey(data, "ctrl+c")) {
		tui.stop();
		process.exit(0);
	}
	return undefined;
});

tui.start();
```

```bash
cd packages/tui/examples
npm run 01-hello
# 或：node --import ./register.mjs 01-hello/hello.ts
```

编辑器会在调用 `onSubmit` 之前清空自己的缓冲区，宿主不需要手动重置。
`tui.start()` 开启原始输入并调度首帧绘制；`tui.stop()` 恢复终端。如果看到
`process is not defined`，说明你不是在 Node 下运行：`process` 是 Node 的全局对象，
不是浏览器对象。

`TUI` 的第二个参数启用硬件光标。保持默认值（`false`）时，编辑器把插入符渲染成
帧内的普通字形 —— `symbols.inputCursor`，通常是 `▏`。这个字形属于真正的帧内容，
所以 `tui.stop()` 之后它会作为残留标记留在终端里。传 `true` 后帧内不再包含光标
字形，引擎会把真实的终端光标停在最后一行渲染内容之后，oh-my-pi 就是这样做的。

## 2. 渲染模型

`@cloud-pi/tui` 只有一个渲染器类 `TUI`，没有 pi-tui 中
`TuiMainScreen`/`TuiAltScreen` 的成对实现。

- 转录内容绘制在终端的普通屏幕上，因此原生 scrollback 会保留更早的输出。
- 首帧锚定在可见屏幕顶部并重绘该区域，所以屏幕上原有的 shell 输出会被覆盖
  （oh-my-pi 也是如此）。这不是清空 scrollback：视口之上的内容仍然保留。
  给 `tui.start()` 传 `clearScrollback: true` 才会连原生 scrollback 一起擦除。
- 渲染是差分的：`render(width)` 产出各行，引擎只写入变化的行。终端支持时使用
  同步输出（`?2026`）。
- 覆盖层绘制在转录内容之上。给 `showOverlay()` 传 `fullscreen: true` 时，该覆盖层
  的生命周期内会借用备用屏。
- 尺寸变化重排由引擎处理；用
  `tui.setResizeScrollback("append" | "rebuild" | "preserve")` 选择稳定后的 resize
  如何影响已保留的历史。
- 如果需要在应用内维护视口，请用 `ScrollView` 包裹内容，或使用布局容器
  （`Stack`、`Row`、`SplitPane`）。

如果希望先绘制、后接管 stdin，可以延迟启用输入：

```ts
tui.start({ deferInput: true });
// ……稍后，应用准备好接收按键时
tui.enableInput();
```

延迟期间，可打印字符仍通过内核回显编辑焦点组件；其他按键会先被暂存，
由 `enableInput()` 回放。

## 3. 组件契约

```ts
interface Component {
	render(width: number): readonly string[];
	invalidate?(): void;
	handleInput?(data: string): void;
}
```

规则：

1. **宽度。** 返回的每一行可见宽度都必须不超过 `width`。请使用
   `truncateToWidth()`、`wrapTextWithAnsi()`、`visibleWidth()`，不要手写宽度计算；
   它们会处理 ANSI 转义、CJK 宽字符和 emoji。
2. **不可变性。** 返回的数组及其行归组件所有，引擎不会修改它们。内容不变时应返回
   同一个数组引用——引擎把引用相等当作“行内容逐字节相同”的证明。内容一旦变化，
   必须返回新数组。
3. **缓存。** 按宽度缓存，并在 `invalidate()` 中清空。
4. **渲染是拉模式。** 不要写 `stdout`。状态变化后先调用 `invalidate()`，再调用
   `tui.requestRender()`。

自定义组件：

```ts
import type { Component, TUI } from "@cloud-pi/tui";
import { matchesKey, truncateToWidth } from "@cloud-pi/tui";

class Picker implements Component {
	private index = 0;
	private readonly items = ["alpha", "beta", "gamma"];
	private readonly tui: TUI;
	private cachedWidth?: number;
	private cachedLines?: readonly string[];

	constructor(tui: TUI) {
		this.tui = tui;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "up")) {
			this.index = Math.max(0, this.index - 1);
		} else if (matchesKey(data, "down")) {
			this.index = Math.min(this.items.length - 1, this.index + 1);
		} else {
			return;
		}
		this.invalidate();
		this.tui.requestRender();
	}

	render(width: number): readonly string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}
		this.cachedWidth = width;
		this.cachedLines = this.items.map((item, i) =>
			truncateToWidth(`${i === this.index ? "> " : "  "}${item}`, width),
		);
		return this.cachedLines;
	}
}
```

挂载方式：

```ts
const picker = new Picker(tui);
tui.addChild(picker);
tui.setFocus(picker);
```

## 4. 内置组件

内容：`Text`、`TruncatedText`、`Markdown`、`Image`。

布局：`Container`、`Box`、`Spacer`、`Stack`、`Row`、`SplitPane`、`ScrollView`。

输入：`Input`、`Editor`、`Form` / `FormField`（`TextFormField`、
`SelectFormField`）。

选择：`SelectList`、`SettingsList`、`MenuSelection`、`TreeView`、`TabBar`。

反馈：`Loader`、`CancellableLoader`、`ProgressBar`、`Sparkline`、
`MetricRow`。

结构：`Section`、`KeyValueList`、`Table`、`Disclosure`、`WizardStep`。

需要了解的构造方式：

```ts
new Text("hello", 1, 1);                          // 文本, paddingX, paddingY
new TruncatedText("one long line", 0, 0);
new Markdown(source, 1, 0, getMarkdownTheme());    // 必须传主题
new Editor(getEditorTheme());
new Input();                                       // 之后设置 input.prompt = "> "
new SelectList(items, 8, getSelectListTheme());    // 选项, 可见行数, 主题
new Loader(tui, s => theme.fg("accent", s), s => theme.fg("muted", s), "Loading…");
new ScrollView(componentOrLines, { height: 12, scrollbar: "auto" });
```

主题适配器（`getEditorTheme`、`getMarkdownTheme`、`getSelectListTheme`、
`getSettingsListTheme`、`getSymbolTheme`）从 `@cloud-pi/tui` 和
`@cloud-pi/tui/theme` 导出。`Loader` 需要 `TUI` 实例，以便在每一帧 spinner 时请求
重绘；它在构造时开始计时，在 `dispose()`/`stop()` 时停止。

### Composer 样式

编辑器外框——上下边框、左右边框、内边距、提示符 gutter——由 `ComposerStyle`
决定，编辑器按 id 解析：

```ts
import { Editor, getEditorTheme, initTheme, theme, visibleWidth } from "@cloud-pi/tui";

await initTheme();
const editor = new Editor(getEditorTheme());
editor.setBorderStyle("claude");

const status = theme.fg("muted", "claude mode");
editor.setTopBorder({ content: status, width: visibleWidth(status) });
```

内置 id（`BUILTIN_EDITOR_BORDER_STYLES`）：`box`（默认）、`band`、`claude`、
`pi`、`borderless`、`rule`、`field`、`rail`。未知 id 回退到 `box`；
`setBorderVisible(false)` 会把任何样式折叠为 `borderless`。

`claude`（`claudeComposerStyle`）在无边框输入区上下各画一条整宽横线，并使用
`❯ ` 提示符。它的 `verticalChrome` 是 2，即上下各多占一行。状态内容作为右对齐
chip 挂在顶线上，窄终端下会被截断；传入的 width 必须是内容的可见宽度。
`setTopBorder()` 会缓存传入值——对于持续变化的状态，改用
`setTopBorderProvider(width => ...)`，它每帧只执行一次；
`getTopBorderAvailableWidth(terminalWidth)` 给出 chip 可用的宽度。需要覆盖
提示符或内边距时，用 `setPromptGutter()` 和 `setPaddingX()`。

如果想派生一个变体，注册一次并用新 id 选用；内置 id 不允许替换：

```ts
import { claudeComposerStyle, registerComposerStyle } from "@cloud-pi/tui";

const dispose = registerComposerStyle({
	...claudeComposerStyle,
	id: "claude-soft",
	filledSurface: false, // 保持编辑器默认文字颜色，与内置样式一致
});
editor.setBorderStyle("claude-soft");
dispose(); // 注销后，该 id 会回退解析到 "box"
```

## 5. 焦点与 IME

接收键盘输入的组件实现 `Focusable`：

```ts
interface Focusable {
	focused: boolean;
	setUseTerminalCursor?(useTerminalCursor: boolean): void;
}
```

- `tui.setFocus(component)` 会设置 `focused`，并把 `handleInput` 路由到该组件。
- 聚焦时，在文本光标位置输出 `CURSOR_MARKER`（`\x1b_pi:c\x07`）。引擎会找到并
  剥离该标记，然后把硬件光标放到那里。这个位置决定了 IME 候选窗（中文、日文等）
  是否出现在正确的地方。
- 内嵌 `Input`/`Editor` 的容器必须实现 `Focusable`，并把 `focused` 转发给子输入框，
  否则 IME 定位会错乱。

`Input` 和 `Editor` 已经实现了这些。自定义单行控件应复制这套
`focused`/标记模式，而不是通过写转义序列来定位光标。

## 6. 覆盖层

```ts
const overlay = tui.showOverlay(new Text("Confirm?", 1, 1), {
	anchor: "center",                 // center、top-left、bottom-right 等
	width: "80%",                     // 列数或百分比
	maxHeight: 20,
	margin: 1,
	visible: (width, height) => width >= 80, // 窄终端下隐藏
});

overlay.setHidden(true); // 临时隐藏
overlay.setHidden(false);
overlay.hide();          // 永久移除
```

其他选项：`minWidth`、`offsetX`/`offsetY`、绝对位置 `row`/`col`（数字或百分比）、
`fullscreen`（借用备用屏）。`showOverlay()` 会自动把焦点交给覆盖层组件；键盘输入
进入最上层的可见覆盖层，关闭时焦点恢复到打开前的组件。

## 7. 按键

```ts
import { Key, matchesKey, parseKey } from "@cloud-pi/tui";

matchesKey(data, Key.enter);
matchesKey(data, Key.ctrl("c"));
matchesKey(data, "shift+tab");
matchesKey(data, "ctrl+shift+left");
```

`matchesKey` 同时支持传统 VT 序列和 Kitty 键盘协议。Kitty 协议可以区分
Enter / Shift+Enter / Ctrl+Enter，但需要终端支持并在启动时协商；老终端和 tmux 下会
降级。需要更底层的处理时，可以使用 `parseKey()`、`isKeyRelease()`、
`isKeyRepeat()` 和 `parseKittySequence()`。

组件快捷键应通过按键管理器配置，而不是硬编码字符串：

```ts
import { KeybindingsManager, setKeybindings, TUI_KEYBINDINGS } from "@cloud-pi/tui";

const bindings = new KeybindingsManager(TUI_KEYBINDINGS, {
	"tui.input.copy": "ctrl+shift+c",
});
setKeybindings(bindings);

// 之后在 handleInput 中：
// bindings.matches(data, "tui.input.copy")
```

`TUI_KEYBINDINGS` 记录了内置的编辑器/输入/选择动作及其默认按键。运行时用
`setUserBindings()` 重新映射，用 `getConflicts()` 检查两个动作是否抢占了同一按键。
应用级默认值（粘贴图片、分页键等）位于 `src/app-keybindings.ts`；该模块尚未加入
公共导出。

## 8. 主题

主题是进程级单例，以实时绑定（live binding）的形式导出：

```ts
import { initTheme, onThemeChange, setTheme, theme } from "@cloud-pi/tui";

await initTheme();                 // 加载默认（dark/light）主题

const label = new Text("", 1, 0);
label.setStyleFn(text => theme.fg("accent", text)); // 跟随主题切换
label.setText("Accent text");

onThemeChange(() => tui.requestRender());
await setTheme("light");           // 监听器会用新颜色重绘
```

- `theme.fg(color, text)` / `theme.bg(color, text)` 返回包裹 ANSI 的字符串；
  `theme.getFgAnsi()` / `getBgAnsi()` 返回原始码。
- `initTheme(enableWatcher?, symbolPreset?, colorBlindMode?, darkTheme?, lightTheme?)`
  加载当前主题，并可选地启动文件监听。
- `setTheme(name, enableWatcher?)` 在运行时切换主题，`previewTheme(name)` 应用临时
  预览，`onThemeChange(callback)` 通知监听者。主题变化本身不会触发重绘；请用
  `onThemeChange` 订阅并调用 `tui.requestRender()`。
- `getThemeByName(name)` 加载主题对象但不激活它。
- 内置主题为 `dark` 和 `light`；自定义主题从用户主题目录加载。颜色键
  （accent、border、mdHeading、syntaxKeyword 等）列在
  `src/theme/schema-validation.ts`。
- `getMarkdownTheme()`、`getEditorTheme()`、`getSelectListTheme()`、
  `getSettingsListTheme()` 会为需要显式主题对象的组件快照当前主题。

语法高亮是可插拔的，且**默认关闭**。在宿主安装引擎之前，`Markdown` 只渲染纯文本：

```ts
import { setHighlighter } from "@cloud-pi/tui/theme";

setHighlighter({
	supportsLanguage: lang => lang === "ts",
	highlightCode: (code, lang, colors) => {
		// colors.keyword / comment / string 等是 ANSI SGR 字符串
		return myHighlighter(code, lang, colors);
	},
});
```

## 9. 图片与通知

内联图片支持 Kitty 和 iTerm2 协议（不支持 SIXEL）：

```ts
import { readFile } from "node:fs/promises";
import { Image, theme } from "@cloud-pi/tui";

tui.setMaxInlineImages(4);
const budget = tui.imageBudget;
const bytes = await readFile("logo.png");
const image = new Image(
	bytes.toString("base64"),
	"image/png",
	{ fallbackColor: text => theme.fg("muted", text) },
	{ maxWidthCells: 40, filename: "logo.png", budget },
);
tui.addChild(image);
```

`tui.imageBudget` 限制同时以真实图形渲染的图片数量；超出的图片回退为文本占位符。
预算必须使用 TUI 自带的实例：TUI 每帧会发出该预算队列中的 `a=t` 传输，自己新建的
`ImageBudget` 在 Kitty 终端上会导致只发定位、不发数据，图片无法显示。
`getImageDimensions(base64, mimeType)` 无需通过终端解码即可返回像素尺寸。

通知：

```ts
import { getTerminalInfo, TERMINAL_ID } from "@cloud-pi/tui";

getTerminalInfo(TERMINAL_ID).sendNotification({
	title: "Build",
	body: "Finished in 12s",
});
```

发送方式会根据终端能力选择 OSC 9、OSC 99 或 BEL；在多路复用器中会被吞掉时，
会通过 tmux/screen/zellij 路由。

## 10. 调试与测试

```bash
# 抓取写入终端的原始 ANSI 流
PI_TUI_WRITE_LOG=/tmp/tui-ansi.log node --import ./register.mjs 01-hello/hello.ts
```

引擎钩子：

- `tui.addPaintListener(paint => ...)` 观察完成的绘制。
- `tui.getDebugDocument()` 返回当前帧的文本行。
- `tui.injectDebugInput(data)` 通过正常输入路径注入字节。
- `tui.addFrameWriteListener(data => ...)` 观察每次写入的帧。

组件钩子（`invalidate`、`debugState`、`debugChildren`）被仓库测试使用。测试在
Vitest 下运行，`test/setup.ts` 会安装 Bun shim：

```bash
# 在仓库根目录执行
npm run test -w @cloud-pi/tui        # 对 src/ 运行 Vitest
npm run test:dist -w @cloud-pi/tui   # 对构建产物运行 node --test
npm run verify                       # 类型检查 + 构建 + 两套测试
```

引擎和组件测试位于 `test/`；它们借助 Bun shim 运行，不需要真实终端。本目录中的
demo 不属于测试套件。

## 11. 建议的 demo 顺序

一套覆盖大部分 API 的递进练习。每个 demo 是一个目录加一个入口文件，与
`01-hello/hello.ts` 保持一致：

1. `01-hello/hello.ts` —— `Text` + `Editor`，Ctrl+C 退出。
2. `02-picker/picker.ts` —— 自定义 `Component`、按宽度缓存、方向键导航。
3. `03-list/list.ts` —— `SelectList` + `Input` 过滤，焦点切换。
4. `04-overlay/overlay.ts` —— 确认框、百分比尺寸、窄终端隐藏。
5. `05-theme/theme.ts` —— `setTheme`/`previewTheme`、`onThemeChange` 重绘、
   带样式的 `Text`。
6. `06-markdown/markdown.ts` —— 流式 `Markdown` 与自定义高亮器。
7. `07-loader/loader.ts` —— 用 `Loader`/`CancellableLoader` 包裹异步任务。
8. `08-image/image.ts` —— `Image` + `ImageBudget` 与文本回退。
9. `09-notify/notify.ts` —— 后台任务完成后的终端通知。
10. `10-composer/composer.ts` —— 在内置样式间切换 `setBorderStyle`、在 `claude`
    顶线上挂状态 chip、注册一个变体。

尽量让每个 demo 保持单文件；只有当多个 demo 会重复主题/终端初始化时，才抽一个小的
`createTui()` 辅助函数。

每个 demo 都已在 `examples/package.json` 中注册脚本，例如 `npm run 02-picker`
会执行 `node --import ./register.mjs 02-picker/picker.ts`。

## 12. 与 pi、oh-my-pi 的关系

`@cloud-pi/tui` 抽取自 oh-my-pi 的 `packages/tui`（其源头是 pi）。渲染引擎、组件、
主题、按键、图片和通知都尽量贴近上游，但有以下有意为之的差异：

- **单一 `TUI` 类**，没有主屏/备用屏成对实现。
- **没有 TSP**（Tern Surface Protocol），也没有原生 `describe()` 接口。
- **没有 SIXEL**，只支持 Kitty 和 iTerm2。
- **没有 FFI 或原生插件**；文本测量和按键解析都是纯 TypeScript。
- **不依赖 Bun 运行时**；一个小的 shim 提供源码使用的 Bun API，由构建时注入。
- **不包含 CLI 产品模块**（聊天转录、工具渲染器、状态栏、安装向导、调试服务器）。
- **可插拔高亮**，默认不附带任何引擎。

完整 API 说明见 [../README_cn.md](../README_cn.md)；逐文件的来源与改动见
[../PATCHES_cn.md](../PATCHES_cn.md)。

## SVG 图片

`npm run 12-svg` 运行 `12-svg/svg.ts`：在 worker 中栅格化 SVG，通过 Kitty/iTerm2 显示。
FigureMarkdown 通过 onChange 通知完成；不支持内联图片的终端显示代码块源码。

## Mermaid 图表

`npm run 13-mermaid` 运行 `13-mermaid/mermaid.ts`：通过 Markdown 渲染状态图，并设置
`markdown.onChange = () => tui.requestRender()`。调整终端大小可验证布局选择。
该示例不需要图片协议或 SVG 渲染器。

两个示例都从源码运行，无需构建。移除组件时 dispose，退出时调用 closeMediaWorkers。
自定义包子路径经 `entries/components.ts`、`entries/image.ts`、`entries/notifications.ts` 和
`entries/multiplexers.ts` 解析，具体实现仍位于 `src/`。
