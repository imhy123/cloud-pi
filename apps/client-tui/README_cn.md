# @cloud-pi/client-tui

终端客户端目前包含欢迎横幅、编辑器和本地 transcript。提交的普通文本会回显；
客户端尚未连接 durable server。

执行 `npm install` 后，在仓库根目录运行：

```sh
npm run client
npm run client -- --version
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

两个命令均不接受参数。未知命令以及 `/clear extra` 等带参数调用仍作为普通文本。
命令区分大小写，分发时忽略首尾空白。不注册 `/language` 命令。

命令框架适配自 oh-my-pi v18.18.7，详见
[PATCHES.md](./PATCHES.md) 和 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。
