# 修改日志

`@cloud-pi/tui` 是 [oh-my-pi](https://github.com/can1357/oh-my-pi) 的 Node.js 移植版，
文本与按键引擎源自 [pi](https://github.com/earendil-works/pi)。两者均采用 MIT 许可证，
参见 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。

## 基线与清单

当前基线：oh-my-pi **v18.18.7**，提交
`e325ffc73ab86e03bdd20a91b77d8e2b3964c906`（2026-11-10）。
两个源自 pi 的引擎保留 pi 提交
`2a32a605a9f18a5f0191f65358a2e764b2f69fc7`。

[SOURCES.json](./SOURCES.json) 记录 `src/` 下每个文件的来源、上游路径、提交、上游
SHA-256 及 verbatim/adapted/new 分类。TypeScript 来源头使用相同分类。JSON 文件保持
合法格式，不添加注释，其来源记录在 SOURCES.json 中。`vendor/pi-utils/` 对应
`packages/utils/src/`，`vendor/package.json` 对应 `packages/utils/package.json`，
其余上游文件保留 TUI 路径。tsconfig、tsup 和 Vitest 的别名将上游包导入映射到本地
兼容层，不修改复制文件的导入；这类文件仍属于 verbatim。

在相邻目录存在 oh-my-pi 和 pi checkout 时运行 `npm run audit:upstream -w @cloud-pi/tui`
（也可设置 `OH_MY_PI_DIR` 和 `PI_DIR`）。审计直接读取固定提交的 Git 对象，校验分类与
来源头，并保留上游原有开头注释。完成同步审查后，可显式运行
`node packages/tui/scripts/provenance.mjs --write` 更新清单和来源头。仅独立的
`// See PATCHES.md.` 行结束来源头，不会删除原有注释。

## 范围

保留渲染循环、终端 I/O、文本/输入工具、组件与 composer 形状、render 辅助、主题运行时、
multiplexer、Kitty/iTerm2 图片、通知、LaTeX、fuzzy/autocomplete、帧率与 spinner 时钟、
行移动和独立 motion-effects 开关。仅 vendoring 被导入的 utils 子集，并整理其 barrel。

未复制：

- `src/apps/`、`src/chat/`、`src/tools/`、`src/overlays/`、`src/setup/`、
  `src/status-line/`、`src/charts/`、`src/html-form/`：CLI 产品界面。
- `src/debug-server.ts`、`src/thinking.ts`、`src/hotkeys-markdown.ts`：CLI/session
  集成及模型/推理强度策略。
- `src/native/`、`src/sixel.ts`、`src/render/sixel.ts`：排除的协议。
- `src/prompt/` 中除 `image-format.ts`、`image-references.ts`、`image-source.ts` 外的文件。
- `src/chrome/` 中除 `keybinding-hints.ts`、`visual-truncate.ts` 外的文件。

当前保留的实现包含 Input 光标位置、流式表格锁宽及稳定前缀 API、树形引导线 SGR 修复、
Windows 输入超时的 poll 宽限，以及保留的 utils 更新（路径比较、环境隔离和日志转发）。
还包含 spinner 时钟、帧率上限、行移动、粘贴分帧、OSC 99 ID、
安全 JSON 解析、LaTeX 样式、彩色 Markdown、可注入按键管理器、编辑器 mention 钩子和
设置菜单。Rex OSC 8 能力及 cacheWarm/cacheCold 符号跟随上游。

## 运行时适配与限制

- Node.js 24+、ESM；不包含 Bun 运行时、FFI、原生 addon、TSP 或 SIXEL。组件保留终端
  `render(width)`；移除原生 describe/overlay/sheet/event API。保留 Kitty/iTerm2，
  仅支持 SIXEL 的终端回退为文本。
- Bun shim 仅实现部分 API。哈希与 Bun 不同，wyhash 映射到 xxHash64。JSONC 使用
  jsonc-parser，YAML 使用 yaml，主题校验使用结构校验。
- 文本与按键解析为纯 TypeScript。测量、切片、截断、换行共享终端 Jamo 宽度设置。
  跨行保留 CSI 和冒号 SGR 状态，包括样式下划线及下划线颜色。
- TtyWriter 使用 Node worker 和共享字节计数，保留 FIFO/背压、EINTR/EAGAIN 重试、
  短写补全、同步 flush 与有时限的 stop。worker 写入进程拥有的 fd，不关闭该 fd。
- Fuzzy 发现读取祖先/嵌套 `.gitignore` 与仓库 `.git/info/exclude`，支持否定规则。
  扫描缓存 1 秒过期，最多 16 种配置；`cache: false` 重新扫描。排序仍是对上游原生评分
  的本地近似。最多扫描 200,000 个条目；取消或超时可能返回部分结果，且不会缓存部分扫描。
  不读取全局 Git excludes 或 linked-worktree 的 info/exclude 文件。
- Mermaid 使用 [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) 1.1.3：
  同步纯 TypeScript，不依赖 DOM、浏览器或原生运行时。测试覆盖流程图、状态图、时序图、
  类图、ER 图和 XY 图样例。适配层支持流程图方向覆盖。布局/语法细节可能与上游 Rust
  不同；无效或不支持的图仍回退为代码块。
- 语法高亮在宿主安装 highlighter 前保持关闭。Windows AltGr 布局发现、Windows 8.3
  路径转换及 stderr fd 重定向仍不可用。macOS 外观检测轮询 `defaults`。

## 逐文件本地差异

逐字复制文件列在 SOURCES.json 中。以下列出所有 adapted/new 源文件；原因描述的是相对
其声明基线的差异。

| 文件 | 分类 | 原因 |
| --- | --- | --- |
| `src/app-keybindings.ts` | adapted | 使用 jsonc-parser 和 yaml 替代 Bun JSONC/YAML。 |
| `src/compat/bun-globals.d.ts` | new | 为注入的 Bun shim 提供环境类型声明。 |
| `src/compat/bun.ts` | new | 部分 Node Bun shim；Unicode Jamo 测量与终端宽度覆盖分离。 |
| `src/compat/keys-engine.ts` | adapted | 使用 pi 按键引擎，并导出 ParsedKittySequence 和 parseKittySequence。 |
| `src/compat/natives-path.ts` | new | Windows 8.3 长短路径辅助原样返回输入。 |
| `src/compat/natives.ts` | new | 文本/按键/高亮/外观兼容层、worker 输出泵、gitignore 发现及 Mermaid 适配。 |
| `src/compat/pi-agent-core.ts` | new | 提供 ThinkingLevel 结构类型和值，不引入 agent 运行时。 |
| `src/compat/pi-ai.ts` | new | 提供图片内容结构类型，不引入提供商运行时。 |
| `src/compat/text.ts` | adapted | 源自 pi 的文本引擎：显式制表宽度、终端 Jamo 宽度、CSI 及冒号 SGR 处理。 |
| `src/components/box.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/disclosure.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/editor.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/form.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/image.ts` | adapted | 移除 TSP/SIXEL；保留 Kitty/iTerm2 与 OSC 8 路径。 |
| `src/components/index.ts` | new | 为现有库导出增加包入口。 |
| `src/components/input.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/key-value-list.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/layout/geometry.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/layout/row.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/layout/split-pane.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/layout/stack.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/loader.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/markdown.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/metric.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/progress-bar.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/scroll-view.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/section.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/select-list.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/settings-list.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/spacer.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/tab-bar.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/table.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/text.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/tree-view.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/truncated-text.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/components/wizard-step.ts` | adapted | 移除 TSP；逐元素比较替代原生 sameItems。 |
| `src/image.ts` | new | 为现有库导出增加包入口。 |
| `src/index.ts` | adapted | 整理库导出；不导出 CLI、原生界面或调试服务器。 |
| `src/keys.ts` | adapted | 公开重导出 KeyEventType，供生成的声明使用。 |
| `src/latex-block.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/multiplexers/index.ts` | new | 为现有库导出增加包入口。 |
| `src/notifications.ts` | new | 为现有库导出增加包入口。 |
| `src/prompt/image-references.ts` | adapted | 移除原生链接状态与 span；保留终端链接标记及 OSC 8 策略。 |
| `src/render/code-cell.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/render/extension-links.ts` | adapted | 移除原生链接状态与 span；保留终端链接标记及 OSC 8 策略。 |
| `src/render/file-list.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/render/hyperlink.ts` | adapted | 移除原生链接状态与 span；保留终端链接标记及 OSC 8 策略。 |
| `src/render/index.ts` | adapted | 移除 TSP/SIXEL；保留 Kitty/iTerm2 与 OSC 8 路径。 |
| `src/render/output-block.ts` | adapted | 移除 TSP/SIXEL；保留 Kitty/iTerm2 与 OSC 8 路径。 |
| `src/render/output-pane.ts` | adapted | 移除原生/SIXEL 路径；使用本地身份缓存替代原生 Memo。 |
| `src/render/tool-card.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/render/tree-list.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/render/width-aware-text.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/stdin-buffer.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/terminal-capabilities.ts` | adapted | 移除 TSP/SIXEL；保留 Kitty/iTerm2 与 OSC 8 路径。 |
| `src/terminal.ts` | adapted | 移除 FFI、TSP 与 SIXEL 探测；保留 DA1 排空及 Node 输入处理。 |
| `src/theme/index.ts` | adapted | 增加可插拔高亮 API 及公共声明支持。 |
| `src/theme/schema-validation.ts` | adapted | 结构校验替代 omptype/ArkType。 |
| `src/theme/shimmer.ts` | adapted | 移除 TSP describe/原生界面；终端渲染保留上游实现。 |
| `src/theme/theme.ts` | adapted | 仅移除注释中特指 SIXEL 的措辞。 |
| `src/tmux.ts` | adapted | 移除 TSP 会话辅助与 SIXEL 客户端探测。 |
| `src/ttyid.ts` | adapted | 使用 Node /proc、readlink 和 ps 替代 ttyname FFI。 |
| `src/tui.ts` | adapted | 移除原生界面、调试服务器与 SIXEL 集成；保留 DA1 排空及 Node 终端所有权处理。 |
| `src/vendor/pi-utils/dirs.ts` | adapted | 使用默认 JSON 导入支持打包；清单保持 v18.18.7 版本。 |
| `src/vendor/pi-utils/index.ts` | adapted | 整理库导出；不导出 CLI、原生界面或调试服务器。 |
| `src/vendor/pi-utils/postmortem.ts` | adapted | 使用 Node exit/SIGKILL 替代 reallyExit；移除 worker reportError。 |
| `src/vendor/pi-utils/stderr-guard.ts` | adapted | 移除 FFI；fd-2 重定向仍不可用。 |
| `src/vendor/pi-utils/yaml-config.ts` | adapted | 使用 yaml 包替代 Bun.YAML.stringify。 |
| `src/windows-altgr.ts` | adapted | 移除 user32 FFI；保留可注入转换，布局发现为空。 |

## 构建、测试与声明

`tsup.config.ts`、`vitest.config.ts`、`tsconfig.json`、`scripts/`、`SOURCES.json`
及本地测试属于包基础设施。`test/markdown-incremental-lex.test.ts` 和
`test/test-themes.ts` 从相同 v18.18.7 上游测试路径适配（Vitest、本地导入及标准断言）。
其他测试为本地新增。`test/compat-regressions.test.ts` 覆盖兼容性修复。纳入版本控制的
产物测试位于 `test/bundle/`；没有测试时 runner 会失败，并在没有全局 Bun 的全新 Node
进程中导入每个公共入口。`npm run verify` 运行类型检查、构建、源码测试及产物测试。
来源审计单独运行，需要上游 Git 仓库。上游 MIT 声明保持完整。
