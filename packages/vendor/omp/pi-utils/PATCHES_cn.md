# 修改记录

基线：`oh-my-pi` `v18.18.7`（`e325ffc73ab86e03bdd20a91b77d8e2b3964c906`）
的 `packages/utils`。未列出的文件为逐字副本；`SOURCES.json` 记录每个文件的
哈希与类型。

- `index.ts`：针对 TUI + catalog 闭包的精简入口，而非完整上游 barrel。
- `dirs.ts`：通过默认 JSON 绑定读取包清单；`APP_NAME` 与默认配置根改为
  `cloud-pi` / `.cloud-pi`；Windows 路径辅助改为本地 `natives-path.ts`，
  不再依赖 `@oh-my-pi/pi-natives`。
- `env.ts`：以 `process.env` 替代 `Bun.env`；dotenv 加载、环境清理和目录刷新
  仅在显式、幂等的 `initializeEnvironment(options?)` 中执行。导入不修改环境。
  `index.ts` 导出初始化函数和路径选项。
- `sqlite.ts`：基于 `node:sqlite` 重写，仅保留 catalog 模型缓存所需的打开、
  初始化、损坏恢复与错误码判断；恢复宿主 busy timeout（无界面 1 秒、交互式
  5 秒），打开/初始化遇到 BUSY/LOCKED 最多尝试 4 次，使用有上限的指数退避。
  宿主可设置 `busyTimeoutMs`、`maxAttempts` 和 `retryDelayMs`。仍省略原生锁
  shim、WAL 检查点和抢救扫描。持续争用会抛出错误，不当作损坏处理。
- `tls-fetch.ts`：`wrapFetchForExtraCa` 为透传；Node 在进程启动时应用
  `NODE_EXTRA_CA_CERTS`。
- `fetch-retry.ts`：保留上游重试/提示逻辑；仅 Bun 的 `timeout` 请求扩展被
  接受但忽略。
- `temp.ts`：`Bun.gc`/`Bun.sleep`/`Bun.sleepSync` 使用 Node 回退。
- `postmortem.ts`、`sanitize-text.ts`、`tab-spacing.ts`、`test-runtime.ts`、
  `which.ts`、`worker-host.ts`：Bun 全局能力来自 `bun-compat.ts`。
- `stderr-guard.ts`、`yaml-config.ts`：沿用 TUI 内置树中的 Node 适配。
- `bun-compat.ts`、`natives-path.ts`：新增 Node shim。
- `mermaid-ascii.ts` 不属于本包：它依赖 TUI 的原生渲染 facade，位于
  `@cloud-pi/tui` 的 `src/compat/mermaid-ascii.ts`。

哈希相关缓存格式：替换 `Bun.hash` 为确定性 SHA-256 前缀后，catalog 指纹已
提升版本。

## 回归覆盖

- `test/env.test.ts`：导入无副作用、显式加载、优先级、环境清理和初始化幂等性。
  源码示例和客户端在 preload 中显式初始化。
- `test/sqlite.test.ts`：原生锁等待、worker 争用和重试成功、有界 BUSY 失败及损坏
  恢复；不再静默放行空测试集。
