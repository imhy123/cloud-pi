# 修改记录

基线：`oh-my-pi` **v18.18.7**，提交
`e325ffc73ab86e03bdd20a91b77d8e2b3964c906`，包 `packages/catalog`。
[SOURCES.json](./SOURCES.json) 是逐文件权威清单：来源、上游路径、提交、上游
SHA-256 以及 verbatim/adapted/new 分类。每个 TypeScript 文件都带有匹配的
来源头。JSON 与 KDL 产物不含注释，其哈希记录在清单中。

在与 cloud-pi 同级的 `oh-my-pi` 检出（或设置 `OH_MY_PI_DIR`）下运行
`npm run audit:upstream -w @cloud-pi/catalog`。默认只读，`--write` 才重写。

## 运行时与构建

- `package.json`：使用 cloud-pi 包身份、Node 24 engines、tsup/Vitest 脚本和
  workspace 依赖，替代上游 Bun 清单。
- `src/model-cache.ts`：通过内置适配器使用 `node:sqlite` 替代 `bun:sqlite`；
  以确定性 SHA-256 前缀哈希替代 `Bun.hash`；缓存 schema 升至 v16、
  materialization policy 升至 v2，使旧的 Bun 哈希行失效。
- `src/model-manager.ts`：确定性哈希与 `merge-v6` 指纹。
- `src/provider-models/openai-compat.ts`：环境变量读取改用 `process.env`，
  zstd 响应体改用 `node:zlib` 的 `zstdDecompressSync`。
- `src/provider-models/cache-provider-id.ts`、`src/provider-models/special.ts`、
  `src/wire/factory-droid.ts`：改用 `process.env` 与确定性哈希。
- `src/compat/collapse.ts`：以 `node:util` 的 `isDeepStrictEqual` 替代
  `Bun.deepEquals`。
- `src/discovery/gitlab-duo-workflow.ts`：改用 `process.env`。
- `src/discovery/protobuf.ts`：以 `Buffer` base64 替代 `Uint8Array.toBase64`。
- `src/provider-models/google.ts`：移除全局 `fetch.preconnect` 回退；Node 无此
  API。
- 构建：tsup 输出 ESM 与声明文件，覆盖根入口、文档化子路径及所有
  `src/**` 模块。`@oh-my-pi/pi-utils` 与 `@oh-my-pi/omptype` 从 workspace 源码
  打包，因此除 Node 内置模块外 `dist/` 自包含。
- 默认导入不会发起网络发现、写文件、加载 dotenv 或修改宿主环境；源码宿主
  显式调用 `initializeEnvironment`。

## 生成工具

- `scripts/compile-compat.ts`、`scripts/compat-compiler/index.ts`：以 Node fs
  和 `fileURLToPath` 替代 `Bun.write`、`Bun.file` 与 `import.meta.dir`。离线
  重新生成 `rules.json`、`auth-ids.ts`、`provider-ids.ts` 保持确定性。
- `scripts/generate-protocols.ts`、`scripts/proto-parser.ts`：以
  `fs.globSync` 和 Node fs 读写替代 Bun glob/file API。协议生成器仍需要上游
  `oh-my-pi` 检出来源 `.proto` 文件；该输入树不属于 cloud-pi，因此仅保留源码，
  本次未实际执行。
- `scripts/generate-models.ts`：以 Node argv/fs 替代 Bun API。导出的
  `generateModels({ provider?, host?, outputPath? })` 接受 `generation-host.ts`
  定义的可选凭证、发现预处理和 GitLab 模型 hook。CLI `--host` 加载本地 ESM
  默认导出，错误 hook 在生成前拒绝。缺少 hook 时使用环境凭证与快照/种子回退，
  不再由占位函数抛错。CLI 显式初始化 dotenv，程序调用由宿主决定初始化。
  在线生成不是构建/测试前置条件；保留 `buildGeneratedModel` 和
  `mergePreviousSnapshotModels` 供测试使用。
- `bench/classify.bench.ts`：以 `performance.now()` 替代 `Bun.nanoseconds()`。
- `scripts/test-dist.mjs` 与 `scripts/provenance.mjs` 为 cloud-pi 新增工具。

## 测试

- 133 个隔离的上游测试在 `test/*.test.ts` 下由 Vitest 运行。改动为机械替换：
  `bun:test` → `vitest`、`Bun.env` → `process.env`、`Bun.write`/`Bun.file` →
  Node fs、`Bun.serve` → Node `http` 辅助、`bun:sqlite` → 内置 `Database`
  适配器、`Bun.deepEquals` → `isDeepStrictEqual`、`@oh-my-pi/pi-catalog/*` →
  `@cloud-pi/catalog/*`。断言保持不变。
- `test/helpers/http-server.ts` 与 `test/helpers/vitest-clock.ts` 为新增。
- `test/generation-host.test.ts`：凭证/预处理注入、认证句柄关闭、异步 GitLab
  hook、无宿主回退、隔离输出和 CLI 宿主加载。
- `test/compat-parity.test.ts`：完整目录遍历单独使用 30 秒预算，保留所有断言。
- 26 个上游集成测试移至 `test/integration/`，不进入 Vitest 与包 tsconfig。它们
  依赖 cloud-pi 未内置的 `@oh-my-pi/pi-ai` 请求/registry/OAuth 运行时，保留作
  未来宿主的参考覆盖，不声明为通过。
- `test/discovery-null-limits.test.ts` 不再断言 Bun 的逐请求 `tls.ca`；Node 在
  进程启动时应用 `NODE_EXTRA_CA_CERTS`，测试改为断言发现流程把 TLS 交给 Node。

## 生成数据与许可证

- `src/models.json`、`src/compat/rules.json`、`src/compat/auth-ids.ts`、
  `src/compat/provider-ids.ts`、`src/discovery/cursor-proto.ts`、
  `src/discovery/devin-proto.ts` 均复制自固定基线，未从实时来源刷新。生成的
  身份与协议编码 `.ts` 为无注释机器输出，以保证重生成字节一致；其来源记录在
  `SOURCES.json`。
- `LICENSE` 与 `CHANGELOG.md` 为逐字副本；`README.md` 保留上游内容并增加
  cloud-pi Node 移植说明。
