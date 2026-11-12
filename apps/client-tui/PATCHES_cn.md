# oh-my-pi 适配记录

斜杠命令框架以 oh-my-pi tag `v18.18.7`、commit
`e325ffc73ab86e03bdd20a91b77d8e2b3964c906` 为基线。下表本地路径相对于本应用，
上游路径相对于 `packages/coding-agent/src/`。每个适配文件均有来源头。

| 本地文件 | 上游文件 | 变更与原因 |
| --- | --- | --- |
| `src/slash-commands/types.ts` | `slash-commands/types.ts` | 保留元数据、解析结果及本地执行结果。用 `clearTranscript`、`quit` 替换 session/settings/ACP/TUI 运行时；省略两个本地命令不需要的图标、动态描述和异步处理器。 |
| `src/slash-commands/helpers/parse.ts` | `slash-commands/helpers/parse.ts` | 保留 `parseSlashCommand`、`parseSubcommand` 的上游解析行为；移除 scope/usage/error 辅助函数，使用本地类型。 |
| `src/slash-commands/builtin-completions.ts` | `slash-commands/builtin-completions.ts` | 保留通用子命令补全、静态/子命令行内提示及共用辅助函数和选项。移除模型、MCP、路径相关依赖，使用本地类型和 `@cloud-pi/tui`。 |
| `src/slash-commands/builtin-registry.ts` | `slash-commands/builtin-registry.ts` | 通过工厂注入命令定义；保留名称/别名索引、通用补全转换及分发。用同步客户端处理器替换 omp 命令聚合、会话适配、协作和插件操作；在此处理提交文本首尾空白，代替 omp 输入控制器的预处理。 |

新增客户端代码：

- `src/slash-commands/builtin-client.ts` 定义 `/clear`、`/quit`，描述在客户端启动时翻译一次。
- `src/main.ts` 将注册表接入现有 TUI 补全器与提交回调。`/clear` 仅清空本地 transcript；
  `/quit` 与 Ctrl+C 共用欢迎动画、外观轮询及 TUI 的清理逻辑。
- `src/i18n/messages.ts` 提供英文及简体中文描述。
- `src/i18n/locale.ts` 在启动时选择只读 locale，不提供 setter 或变更订阅。横幅在构造时
  接收提示文本，已删除未使用的语言切换 setter。
- `test/slash-commands.test.ts` 验证解析、分发、清空范围、本地化补全/搜索、别名和通用提示函数。

不包含 coding-agent 配置系统、文件命令加载器、ACP 分发器或 omp 内置命令处理器。
TUI 包未修改。
