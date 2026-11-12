# oh-my-pi 适配记录

斜杠命令框架以 oh-my-pi tag `v18.18.7`、commit
`e325ffc73ab86e03bdd20a91b77d8e2b3964c906` 为基线。下表本地路径相对于本应用，
上游路径相对于 `packages/coding-agent/src/`。每个适配文件均有来源头。

| 本地文件 | 上游文件 | 变更与原因 |
| --- | --- | --- |
| `src/slash-commands/types.ts` | `slash-commands/types.ts` | 保留元数据、解析结果及本地执行结果。用 `clearTranscript`、`showSettings`、`quit` 替换 session/settings/ACP/TUI 运行时；省略本地命令不需要的图标、动态描述和异步处理器。 |
| `src/slash-commands/helpers/parse.ts` | `slash-commands/helpers/parse.ts` | 保留 `parseSlashCommand`、`parseSubcommand` 的上游解析行为；移除 scope/usage/error 辅助函数，使用本地类型。 |
| `src/slash-commands/builtin-completions.ts` | `slash-commands/builtin-completions.ts` | 保留通用子命令补全、静态/子命令行内提示及共用辅助函数和选项。移除模型、MCP、路径相关依赖，使用本地类型和 `@cloud-pi/tui`。 |
| `src/slash-commands/builtin-registry.ts` | `slash-commands/builtin-registry.ts` | 通过工厂注入命令定义；保留名称/别名索引、通用补全转换及分发。用同步客户端处理器替换 omp 命令聚合、会话适配、协作和插件操作；在此处理提交文本首尾空白，代替 omp 输入控制器的预处理。 |

新增客户端代码：

- `src/slash-commands/builtin-client.ts` 定义 `/clear`、`/settings`、`/quit`，描述在客户端启动时翻译一次。
- `src/main.ts` 将注册表接入现有 TUI 补全器与提交回调。`/clear` 仅清空本地 transcript；
  `/quit` 与 Ctrl+C 共用欢迎动画、外观轮询及 TUI 的清理逻辑。
- `packages/common/src/i18n/client-messages.ts` 提供 TUI 文案；共享本地化文本、
  错误和 i18n 引擎位于 `@cloud-pi/common`。
- `src/i18n/locale.ts` 根据传入偏好创建 locale；`main.ts` 显式加载设置后再创建它，不提供 setter 或变更订阅。横幅在构造时
  接收提示文本，已删除未使用的语言切换 setter。
- `test/slash-commands.test.ts` 验证解析、分发、清空范围、本地化补全/搜索、别名和通用提示函数。

- `src/settings/store.ts` 参考 `coding-agent/src/config/settings.ts` 的 YAML 配置，
  适配 Node、客户端共享文件、校验及原子写入；省略 agent/项目配置层。
- `src/settings/definitions.ts` 校验并转换 `settings.json` 中统一的分类、分组和设置，`src/settings/controller.ts`
  将其连接到存储与主题。
- `src/tui/components/settings-selector.ts` 参考 `tui/src/overlays/settings-selector.ts`
  的终端设置列表及全屏交互，实现语言、亮暗主题；其他设置展示为只读 mock。分类和状态
  文案已本地化；mock 标签与描述保留上游英文。
- `src/settings/settings.json` 保存提取自上游 `coding-agent/src/**/*.ts`
  设置注册声明的 mock 元数据。
- `test/settings.test.ts` 验证存储、错误处理和面板。

TUI `SettingsList` 增加可选的搜索文案本地化接口。不包含 coding-agent 配置系统、
文件命令加载器、ACP 分发器或 omp 内置命令处理器。

`src/settings/bindings.ts` 负责语言回退、主题发现及保存后的效果。控制器消费通用定义
和 provider 回调，组件负责动态选项菜单的加载、空结果、错误及取消。

`src/cli-options.ts` 解析临时 `--language` 覆盖；`main.ts` 暴露 `startClient`，
由 CLI 传入启动选项，不修改配置文件。
