# 修改日志

`@cloud-pi/tui` 是 [oh-my-pi](https://github.com/can1357/oh-my-pi) 终端 UI
（`packages/tui`，以及 `packages/utils` 的一个子集）的 Node.js 移植版。oh-my-pi 及其
前身 [pi](https://github.com/badlogic/pi-mono) 均采用 MIT 许可证；参见
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。

基线：oh-my-pi 提交 `83de60ad992d12e572ec3ed6fe2dd9e160cdc4a2`
（2026-11-03），`packages/tui/src` 与 `packages/utils/src`。其后的选择性同步来自
`21f1188cf88`（2026-11-09），见第 10 节。

本文件列出所有**非**逐字复制的文件。逐字复制保留上游路径与内容。`src/vendor/` 下的
文件保留相对于 `packages/utils/src/` 的上游路径；其余文件保留相对于
`packages/tui/src/` 的上游路径。

## 0. 来源声明头

`src/` 下的每个文件都以一个注释头开头，说明该文件是逐字复制、修改后复制，还是全新文件。
修改后复制会注明上游文件、基线提交和具体改动。这些头仅作文档用途，在使用处重复本日志的
信息，不计为实质性修改。

若要对照基线核对清单，先去掉文件头再比较：

```sh
strip_header() {
	awk 'NR==1 && /^\/\/ cloud-pi-tui:/ {header=1; next}
	     header && /^\/\// {next}
	     header && /^$/ {header=0; next}
	     {print}' "$1"
}

diff -q <oh-my-pi>/packages/tui/src/components/text.ts \
        <(strip_header src/components/text.ts)
```

## 1. 复制范围

保留：渲染循环（`tui.ts`）、终端 I/O（`terminal*.ts`、`active-terminal.ts`、
`stdin-buffer.ts`）、文本工具（`utils.ts`）、输入（`keys.ts`、`keybindings.ts`、
`mouse.ts`、`bracketed-paste.ts`、`vim.ts`、`space-hold.ts`、`kill-ring.ts`）、
组件、渲染辅助、主题运行时、复用器适配器、Kitty graphics、桌面通知，以及它们依赖的
LaTeX/fuzzy/autocomplete 辅助函数。`prompt/` 只保留 `image-format.ts`、
`image-references.ts` 和 `image-source.ts`；`chrome/` 只保留
`keybinding-hints.ts` 和 `visual-truncate.ts`。

未复制（属于 CLI 产品表面，而非可复用 TUI 库）：

- `src/apps/`、`src/chat/`、`src/tools/`、`src/overlays/`、`src/setup/`、
  `src/status-line/`、`src/charts/` —— 示例、聊天记录、工具渲染器、选择器、初始化
  向导、状态栏、图表渲染。
- `src/debug-server.ts` —— 无头调试 socket 服务器（也因设计原因排除；它依赖 CLI 的
  会话模型）。
- `src/native/`、`src/sixel.ts`、`src/render/sixel.ts` —— 完全移除；见第 2、3 节。
- `src/thinking.ts`、`src/hotkeys-markdown.ts` —— CLI 面向的展示辅助。
- `src/prompt/` 与 `src/chrome/` 的其余部分 —— composer、编辑器、overlays、消息
  边框及其他 CLI 拥有的界面元素。

`src/vendor/pi-utils/` 是 `packages/utils/src/` 的子集（TUI 导入的模块）。
`src/vendor/pi-utils/index.ts` 是精选门面；上游 barrel 会引入本包不发布的 session、
worker、SQLite 和 stream 辅助。`src/vendor/package.json` 是上游清单，因 `dirs.ts`
从 `../package.json` 读取版本和 engines 字段而保留。

## 2. 移除：Tern Surface Protocol（TSP）

TSP 是一种带外语义协议：面向原生 Tern 前端的 `describe()`（`render()` 的替代方案），
外加原生 overlays、sheets、screens 和 UI 事件。现已全部移除。组件只保留不可变的
`render(width)` 契约。

从公开表面移除的 API：

- `Component.describe?`、`Component.nativeOverlay?`、`Component.nativeSheet?`、
  `Component.describeScreen?`、`Component.handleNativeEvent?`
- `Container.describe`
- `describeWorkingRow` 与 `WorkingRowSpec`/`WorkingRowVariant`
- `describeShimmer`
- `describeOutputLines`、`NativeOutputOptions`
- `describeFileList`
- `describeOutputBlock`、`NativeOutputBlockSection`
- `describeHeader`（code cell）
- `nativeLayoutChild`、`nativeLayoutGap`、`nativeSlotProps`
- `NativeEditorLayout` 以及编辑器的 describe 装饰管线
- `prefsSectionId`、`settingPrefsRow`、`PrefsEditing`、`PrefsOptionSource`、
  `PrefsSectionRef`（原生偏好设置编辑）
- `linkedImageSpan`、`fileLinkSpan`、`isNativeLinkEnabled`
- `outputStateTone`、`outputStateStatus`
- `NativeBackend`、`NativeHost`、`assumedTspHello`、`TspFrame`、`TspNode`、
  `TspText`、`TspSpan`、`TspProps`、`TspSpace`、`TspTone`、`TspCardStatus`、
  `TspPreview`、`TspEditorDecoration`、`TspEditorProps`、`TspPrefsControl`、
  `TspPrefsRow`
- `TuiDebugServer`（`TUI` 中的调试 socket 集成）
- `setTmuxPaneApcTitles`、`tmuxSessionSpeaksTsp`

因此产生非逐字复制的文件：

| 文件 | 改动 |
| --- | --- |
| `src/tui.ts` | 原生后端选择、TSP hello 探测、原生 overlay/sheet 绘制路径、`Component` 原生成员、容器 `describe`、debug-server 接线 |
| `src/terminal.ts` | TSP hello 查询/应答、ConPTY 的 APC→OSC 改写、tmux TSP 标题握手、`tspPathBlocker`、`completeTspInput`、`TSP_OSC_PREFIX` |
| `src/components/box.ts`、`disclosure.ts`、`input.ts`、`key-value-list.ts`、`layout/geometry.ts`、`layout/row.ts`、`layout/split-pane.ts`、`layout/stack.ts`、`loader.ts`、`markdown.ts`、`metric.ts`、`progress-bar.ts`、`scroll-view.ts`、`section.ts`、`select-list.ts`、`settings-list.ts`、`spacer.ts`、`tab-bar.ts`、`table.ts`、`text.ts`、`tree-view.ts`、`truncated-text.ts`、`wizard-step.ts` | `describe()` 实现、原生 child/slot 辅助、TSP token |
| `src/components/editor.ts` | describe 编辑器布局、装饰、原生光标/选区节点 |
| `src/components/form.ts` | describe 字段树、picker sheet、`StyledText` 上的 TSP span token |
| `src/components/image.ts` | 原生 image 节点与可打开图片属性 |
| `src/render/code-cell.ts`、`extension-links.ts`、`file-list.ts`、`hyperlink.ts`、`output-block.ts`、`output-pane.ts`、`tool-card.ts`、`tree-list.ts`、`width-aware-text.ts` | describe 变体、原生 link span、原生渲染分支 |
| `src/theme/shimmer.ts` | `describeShimmer` 与原生“什么都不画”分支 |
| `src/latex-block.ts` | describe 的 LaTeX 节点 |
| `src/prompt/image-references.ts` | 原生 link span；`imageLinksEnabled` 现在仅反映 OSC 8 支持 |
| `src/index.ts` | 移除 native/debug-server 导出；`glyph-protocol` 导出位置调整 |

TSP 还假定首帧起就使用原始输入。因此 `TUI` 和 `ProcessTerminal` 增加了
`#da1Answered` 跟踪：当终端已应答 DA1 查询时，空闲窗口之后到达的迟到应答会被
`drainInput` 吞掉，而不会作为键入文本出现（这本是 TSP 模式覆盖的职责）。

## 3. 移除：SIXEL

移除 SIXEL 支持；只保留 Kitty 和 iTerm2 内联图片。移除内容：

- `ImageProtocol.Sixel` 与 `"sixel"` 原始协议值
- `encodeSixel`/`encodeSixelAsync`、`isWindowsTerminalPreviewSixelSupported`
- `getSixelLineMask`、`cropSixelTop`、`ensureSixelRasterWidth`
- `renderForScrollback`、`ImageOptions.requestRender`、每图片的 SIXEL 编码缓存，
  以及 `uncapSixel`/`hasSixel` 输出面板选项
- `render/output-block.ts` 中的 SIXEL 载荷保留逻辑
- `tmux.ts` 中的 SIXEL 检测（`tmuxClientRendersSixel`）
- `tui.ts` 中的 SIXEL 探测与顶部裁剪路径
- `src/sixel.ts`、`src/render/sixel.ts`（已删除），以及 `render/sixel` barrel 导出

受影响文件：`src/terminal-capabilities.ts`、`src/components/image.ts`、
`src/render/output-block.ts`、`src/render/output-pane.ts`、`src/render/index.ts`、
`src/terminal.ts`、`src/theme/theme.ts`（注释）、`src/tmux.ts`、`src/tui.ts`。

结果：仅支持 SIXEL 的终端会被判定为没有内联图片协议，图片回退为文本占位符。

## 4. 移除：FFI 与原生绑定

`@oh-my-pi/pi-natives`（Rust 插件）与 `bun:ffi` 由纯 JavaScript 门面替代。

- `src/compat/natives.ts`（新增）：TUI 调用的原生包子集 —— 文本测量/换行/切片、按键
  解析、语法高亮（可插拔）、macOS 外观检测、`TtyWriter`、Mermaid ASCII 渲染和
  fuzzy 查找。
- `src/compat/text.ts`（新增）：纯 TypeScript 文本引擎 —— `visibleWidth`、
  `stripAnsi`、`wrapTextWithAnsi`、`truncateToWidth`、`sliceWithWidth`、
  `extractSegments`、`extractAnsiCode`，以及 3 单元格制表位。
  算法基于 `pi`（`packages/tui`），Unicode 宽度表使用 `get-east-asian-width`
  （UAX #11）。
- `src/compat/keys-engine.ts`（新增）：纯 JS 按键解析（`matchesKey`、`parseKey`、
  `parseKittySequence`、release/repeat 检测、可打印字符解码）。
- `src/compat/natives-path.ts`（新增）：oh-my-pi 中为原生的 Windows 长/短路径辅助。
- `src/keys.ts`、`src/utils.ts`、`src/theme/tui-adapters.ts`、
  `src/theme/mermaid-cache.ts`、`src/render/render-utils.ts`、
  `src/autocomplete.ts`、`src/key-hint-format.ts`：改为导入兼容门面，而非
  `@oh-my-pi/pi-natives`。
- `src/windows-altgr.ts`：没有 `user32.dll` 绑定。保留可注入的 `AltGrHost` 接缝和
  转换逻辑，但 `readAltGrLayer` 始终返回空布局，因此 Alt 组合键保持为快捷键。
- `src/ttyid.ts`：`ttyname` FFI 替换为 `/proc/self/fd/0`（Linux）、
  `readlink /dev/fd/0` 后接 `ps -o tty=`（macOS/BSD），Windows 返回 `null`。
- `src/terminal.ts`：移除 `kernel32.dll` UTF-8 控制台代码页保护；Node 不需要它，
  Windows 控制台模式输入回退到纯 TypeScript 的 `win32-input-mode` 解码器。
- `src/components/image.ts`：无原生图片编码；Kitty/iTerm2 载荷由 TypeScript 构建。
- `src/vendor/pi-utils/stderr-guard.ts`：libc `dup`/`dup2` FFI 重定向已移除。所有
  守卫入口均为空操作，因此直接写 fd 2 的原生库不再被重定向离开视口。
- `src/theme/theme.ts` 从兼容门面导入 macOS 外观检测（轮询
  `defaults read -g AppleInterfaceStyle`），而非 FFI。

## 5. Bun → Node.js

运行时基线：Node.js 24（LTS），原生提供 `RegExp.escape` 与 `Promise.try`。

源码仍引用自由变量 `Bun`（上游面向 Bun）。@cloud-pi/tui 运行时不需要全局 `Bun`：

- `src/compat/bun.ts`（新增）导出一个 shim，提供 vendored 源码使用的 API：
  `env`、`stringWidth`、`color`、`hash`（`xxHash64`/`wyhash`/`crc32`）、
  `stripANSI`、`isMainThread`、`which`、`spawn`、`spawnSync`、`sleep`、
  `resolveSync`、`main`、`file`、`inspect` 和 `Glob`。
- `tsup.config.ts` 将该模块注入自由标识符，使打包结果把 `Bun` 解析为导入绑定。
  `test/setup.ts` 将同一 shim 赋给 `globalThis.Bun`，使 TypeScript 源码在 Vitest
  下无需修改即可运行。
- 该 shim 有意保持部分实现，且不与 Bun 字节级兼容：`Bun.hash`/`Bun.hash.wyhash`
  映射为纯 JS xxHash64（仅用于缓存键和目录哈希），`Bun.color` 覆盖 CSS/命名/rgb/hsl
  以及 `ansi-16m`/`ansi-256` 格式，`Bun.Glob` 支持 `*`、`**`、`?`、花括号展开和
  字符类。

其他运行时适配：

| 文件 | 改动 |
| --- | --- |
| `src/app-keybindings.ts` | 本地 JSONC 解析器与 `yaml` 包的 `parse` 替代 `Bun.JSONC`/`Bun.YAML` |
| `src/terminal-capabilities.ts` | `Buffer.toBase64()` 替换为 `toString("base64")` |
| `src/vendor/pi-utils/dirs.ts` | JSON 导入属性：解构默认绑定（esbuild 无法看到命名 JSON 导出） |
| `src/vendor/pi-utils/yaml-config.ts` | `Bun.YAML.stringify` 替换为 `yaml` 包 |
| `src/vendor/pi-utils/postmortem.ts` | Bun 专属 `process.reallyExit` 替换为 `process.exit`/`SIGKILL` |
| `src/vendor/pi-utils/stderr-guard.ts` | 移除 `bun:ffi` 导入（第 4 节） |
| `src/vendor/pi-utils/index.ts` | 用精选门面替代完整上游 barrel |

## 6. 移除：ArkType 主题 schema

`src/theme/schema-validation.ts` 已重写。上游使用 `@oh-my-pi/omptype`（ArkType 兼容
运行时）校验主题；@cloud-pi/tui 使用目的相同的结构化校验器：

- `REQUIRED_THEME_COLORS` / `OPTIONAL_THEME_COLORS` 枚举文档化契约；每个必需键
  必须是字符串或数字。
- 形状检查覆盖渲染消费的主题非颜色字段（name、symbols、spinner 覆盖和嵌套映射）。
- 忽略未知额外属性，因此为更新版 oh-my-pi 编写的主题仍可加载。
- 非法输入抛出 `Invalid theme: <path> must be <expected>`；调用方保留现有的
  回退到 dark 主题行为。

`src/theme/theme.ts`、`src/theme/loader.ts` 和 `src/theme/theme-class.ts` 除此之外
为逐字复制，仅去掉上述 TSP/SIXEL 相关清理。

## 7. 本地重新实现的已移除辅助

一些小辅助原本位于 `src/native/`，在无 TSP 时仍需要：

| 位置 | 改动 |
| --- | --- |
| `src/components/wizard-step.ts` | 逐元素数组比较替代 `native/memo` 的 `sameItems` |
| `src/render/output-pane.ts` | 本地 `Memo` 类替代 `native/memo.Memo`；输出面板选项去掉 SIXEL 字段 |
| `src/render/extension-links.ts` | link-marker 策略不再查询原生渲染状态；只要注册了 scheme 就始终发出标记，并由 TUI 剥离 |
| `src/prompt/image-references.ts` | `imageLinksEnabled` 即解析后的 OSC 8 策略 |
| `src/components/image.ts` | 缓存失效不再有 scrollback/SIXEL 分支 |

未改变其他行为。仅注释改动（例如 `src/theme/theme.ts` 中关于背景回退的说明）会出现在
`diff -rq` 输出中，但不影响语义。

## 8. 新增的、无上游对应模块

- `src/components/index.ts` —— 公共组件 barrel。
- `src/multiplexers/index.ts` —— 公共复用器 barrel。
- `src/image.ts` —— 图片入口（组件、Kitty graphics、终端图片辅助）。
- `src/notifications.ts` —— 通知入口（OSC 格式化、复用器路由、桌面提示）。
- `src/compat/bun.ts`、`bun-globals.d.ts`、`text.ts`、`keys-engine.ts`、
  `natives.ts`、`natives-path.ts`、`pi-ai.ts`、`pi-agent-core.ts` —— 第 4、5 节
  描述的运行时门面。`pi-ai.ts` 与 `pi-agent-core.ts` 是 TUI 消费类型的结构化
  替身，使 provider 客户端和 agent 运行时远离依赖图。
- `src/vendor/package.json` 与 `src/vendor/pi-utils/` —— vendored 工具函数。
- `tsup.config.ts`、`vitest.config.ts`、`tsconfig.json`、`test/` —— 构建与测试
  装置，不派生自上游。

## 9. 与 oh-my-pi 的有意差异

- 无 TSP / 原生 Tern 表面。
- 无 SIXEL。仅 Kitty 和 iTerm2 内联图片。
- 无 FFI 或原生插件。Windows AltGr 布局始终为空；stderr fd 重定向为空操作；
  macOS 外观检测通过调用 `defaults` 完成。
- 在宿主通过 `setHighlighter` 安装之前，语法高亮关闭。
- 不含 CLI 产品模块（apps、chat、tools、overlays、setup、status line、debug
  server）。
- Bun 专属全局由 shim 提供；`Bun.hash` 的取值与 Bun 不完全相同。
- 少数逐字复制的文件仍在注释中提到 TSP 或 SIXEL
  （`src/autocomplete.ts`、`src/stdin-buffer.ts`、`src/key-hint-format.ts`）。
  没有任何代码路径使用这两种协议；这些注释描述的是仍然有效的输入分帧与图标元数据。

## 10. 上游同步：83de60ad99 → 21f1188cf88

上面的基线仍是 TSP/SIXEL 移除的对照基准。此后从 oh-my-pi `21f1188cf88`
（2026-11-09）选择性同步了下列改动。此处涉及的文件在头部注明修改自该提交。

已同步：

| 范围 | 文件 | 改动 |
| --- | --- | --- |
| Spinner 时钟 | `src/spinner-clock.ts`（新增）、`src/components/loader.ts` | 所有 spinner 共享同一个墙上时钟相位；静态 spinner 每秒重绘一次而非按帧率；删除 `SPINNER_ADVANCE_MS` |
| 帧率上限 | `src/frame-rate.ts`（新增）、`src/tui.ts` | `tui.maxFps` 换算为最小帧间隔；终端输入回显保留 30fps 下限 |
| 行移动 | `src/render/row-moves.ts`（新增）、`src/tui.ts` | 终端不支持同步输出时用 `DL`/`IL` 滚动而不是整屏重绘 |
| 粘贴输入 | `src/stdin-buffer.ts` | 括号粘贴分块路由穿插的 APC 粘贴报告，末尾手动 Enter 与粘贴文本分开，删除重叠缓冲 |
| Windows 输入 | `src/windows-input-mode.ts`、`src/terminal.ts` | Ctrl+J（`VK_J`）视为 Enter，win32 中继字符串 5 秒超时，恢复 cooked 模式 typeahead |
| 终端退出 | `src/vendor/pi-utils/postmortem.ts`、`src/terminal.ts` | 终端已断开时标记为 dead，使 `SIGTERM`/`SIGHUP` 跳过 postmortem |
| OSC 99 | `src/terminal-capabilities.ts` | 通知 ID 使用进程级随机前缀 |
| JSON 解析 | `src/vendor/pi-utils/json-parse.ts` | `__proto__` 键按数据属性定义而非赋值 |
| LaTeX | `src/latex-to-unicode.ts`、`src/latex-block.ts` | `\textnormal` 重置粗体/斜体，根号指数的包裹跟随调用方，`\sqrt` 指数样式与环境前景/背景得以保留 |
| 流式 Markdown | `src/components/markdown.ts` | 源码以孤立 `-` 结尾时暂持该行，避免闪现 setext 标题；数学探针去除 ANSI |
| 彩色 Markdown | `src/components/markdown.ts`、`src/theme/schema.ts`、`theme-class.ts`、`loader.ts`、`tui-adapters.ts`、`theme.ts`、`theme-schema.json` | 标题接收 `depth`，新增可选 `strong`/`emphasis`/`tableHeader` 角色，`setMarkdownColorful` 通过 `Theme.ansiFg`/`Theme.faint` 从 `terminal.ansi` 取色 |
| 键位匹配器 | `src/keybinding-matchers.ts` | 匹配器接受注入的 `KeybindingsManager`，不再总是读取全局实例 |
| 编辑器提及补全 | `src/components/editor.ts`、`src/autocomplete.ts` | `setText(text, { cursor })` 可将多行文本的光标放到开头；`AutocompleteProvider.trySyncModelMentionCompletion` 可同步刷新已显示的 `^` 提及弹窗，提及 token 内输入 `:` 会触发补全 |
| 设置列表菜单 | `src/components/settings-list.ts` | 新增 `SettingEditor` 类型与 `menu` 行：宿主可通过 `openSubmenuFor` 把循环行的候选项作为菜单打开，Enter/Space 仍保持循环切换 |
| Kitty 占位符 | `src/kitty-graphics.ts`、`src/terminal-capabilities.ts` | Tern 终端声明支持 Unicode placeholders，与其已识别的 Kitty graphics 能力对齐 |
| 语言识别 | `src/lang-from-path.ts` | `erb` 映射到 `erb` 高亮/LSP 语言 |
| 主题预览 | `src/theme/theme.ts` | 删除只写不读的 `previewThemeName` 记录，`assignTheme` 只接收主题 |

移植时的适配：TSP 分支保持移除（粘贴报告判断仅认 APC），
`stripVTControlCharacters` 来自 `node:util`，主题加载器通过既有 `resolveVarRefs`
解析 `terminal.ansi` 中的 `$var` 引用。

有意未同步：`src/thinking.ts` 等模型/思考策略、prompt 层的
模型提及 provider（`prompt/model-mention-autocomplete.ts`、模型浏览器与 effort 行）、
Rex 终端能力条目（OSC 8 超链接）、`cacheWarm`/`cacheCold` 符号（宿主 status line
缓存标记），以及 CLI 产品面（apps、chat、tools、overlays、setup、status line）。
