# @cloud-pi/client-tui

终端客户端目前包含欢迎横幅、编辑器和本地 transcript。提交的普通文本会回显；
客户端尚未连接 durable server。

执行 `npm install` 后，在仓库根目录运行：

```sh
npm run client
npm run client -- --version
npm run client -- --language zh-CN
npm run typecheck -w @cloud-pi/client-tui
npm run test -w @cloud-pi/client-tui
```

客户端复用 TUI 示例的 TypeScript loader，直接运行源码。

## 斜杠命令

输入 `/` 浏览命令，通过编辑器的补全按键选择。名称保持英文，描述及描述搜索
使用 `src/i18n/locale.ts` 在启动时选择的语言。横幅与命令共用此只读 locale，
语言变更需重启客户端生效。

| 命令 | 行为 |
| --- | --- |
| `/clear` | 仅清空显示的 transcript，保留欢迎横幅和编辑器，不删除服务端或持久化的对话数据。 |
| `/quit` | 停止欢迎动画、终端外观轮询和 TUI，然后退出。Ctrl+C 使用同一个退出函数。 |
| `/settings` | 打开全屏设置面板。`Language` 提供 `English` 和 `中文（简体）`，保存后重启生效。 |

三个命令均不接受参数。未知命令以及 `/clear extra` 等带参数调用仍作为普通文本。
命令区分大小写，分发时忽略首尾空白。不注册 `/language` 命令。

命令框架适配自 oh-my-pi v18.18.7，详见
[PATCHES.md](./PATCHES.md) 和 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。

## 客户端配置

客户端共享 `~/.cloud-pi/client/config.yml`。YAML 中的 `client-tui.language`
接受 `en` 或 `zh-CN`；`client-tui.theme.dark` 和 `client-tui.theme.light` 分别选择暗色和亮色
主题。语言未设置时使用系统语言，无法匹配时回退英文。保存时保留未知
字段及注释；文件格式错误或检测到外部修改时不会覆盖，请先修复文件或重启。面板
会显示加载或保存错误。默认暗色主题为 `titanium`、亮色主题为 `light`；旧的
`appearance.language` 会在下次保存时迁移。服务端配置独立。面板还展示 omp 设置的只读 mock 项，
仅语言及亮/暗主题实际生效；mock 项的标签与描述目前保留上游英文。

设置声明包含静态选项或动态 provider 名称。选项分别保存实际值及本地化标签/描述。
`label.messageKey` 和 `description.messageKey` 显式指定翻译；不提供 key 的语言名称保持原文。`configPath`
独立用于查找宿主的读写绑定，与 i18n 无关。动态 provider 接收取消信号；关闭菜单
会取消请求并忽略延迟结果。宿主绑定与 provider 位于 `src/settings/bindings.ts`。

`--language en` 或 `--language zh-CN` 仅对本次启动覆盖已保存语言，不写回配置。
优先级：命令行参数、配置、系统语言、英文。
