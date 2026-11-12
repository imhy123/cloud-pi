# @oh-my-pi/pi-utils（内置副本）

私有 Node.js workspace，内置 `oh-my-pi` `packages/utils` 中
`@cloud-pi/tui` 与 `@cloud-pi/catalog` 共用的依赖闭包。包名保持上游身份，
使保留的 `@oh-my-pi/pi-utils` 导入无需改写。

- 基线：`oh-my-pi` 标签 `v18.18.7`，提交 `e325ffc73ab86e03bdd20a91b77d8e2b3964c906`。
- 清单：`src/` 以及包元数据和许可证文件；见 `SOURCES.json`。
- 排除项：依赖原生模块、进程监管、提示词或 AI 运行时的无关上游工具不在
  此闭包内。精简后的 `src/index.ts` 只导出保留模块。
- 移除 Bun：`src/bun-compat.ts` 提供保留源码所需的最小 Bun 能力；构建产物
  不依赖全局 Bun shim。
- 身份：`APP_NAME`/配置根为 `cloud-pi` / `~/.cloud-pi`；`VERSION` 与
  `USER_AGENT` 保持上游包版本，以免改变 TUI 行为。

构建（workspace 顺序）：`npm run build -w @oh-my-pi/pi-utils`。
测试：`npm run test -w @oh-my-pi/pi-utils`。
来源审计：`npm run audit:upstream -w @oh-my-pi/pi-utils`。

## 显式宿主初始化

导入 utils 或 catalog 不会加载 `.env` 或清理 `process.env`；`$env` 实时反映已有
环境。需要 omp 启动加载行为的宿主，应在读取应用配置前显式调用一次：

```ts
import { initializeEnvironment } from "@oh-my-pi/pi-utils";

initializeEnvironment();
```

可选的 `cwd`、`home`、`configDir`、`agentDir` 指定四个 dotenv 根目录。
文件优先级为项目、agent、配置根、home；已有的非空进程值优先。重复初始化会被
忽略。TUI 源码示例与客户端的 preload 显式调用，catalog 本身不调用。

SQLite 默认使用宿主 busy timeout（无界面 1 秒、交互式 5 秒）。
`openSqliteDatabaseSync` 对 BUSY/LOCKED 最多尝试 4 次，可覆盖 `busyTimeoutMs`、
`maxAttempts` 和 `retryDelayMs`。初始化回调可能重试，应使用事务保护部分写入，
不要在其中执行外部副作用。
