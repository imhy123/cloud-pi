# @cloud-pi/catalog

`oh-my-pi` **v18.18.7**（`e325ffc73ab86e03bdd20a91b77d8e2b3964c906`）
`packages/catalog` 的 Node.js 移植。保留内置模型数据库、provider 描述与发现、
身份/分类、兼容规则、wire 辅助函数以及生成脚本。Node 适配见
[PATCHES_cn.md](./PATCHES_cn.md)，逐文件清单见 [SOURCES.json](./SOURCES.json)。

- 构建：`npm run build -w @cloud-pi/catalog`（tsup，ESM + 声明文件）。
- 测试：`npm run test -w @cloud-pi/catalog`（Vitest；133 个上游测试文件及宿主注入回归测试）。
- 分发测试：`npm run test:dist -w @cloud-pi/catalog`。
- 离线规则重生成：`npm run gen:compat -w @cloud-pi/catalog`。
- 来源审计：`npm run audit:upstream -w @cloud-pi/catalog`。

catalog 覆盖并不代表所有 provider 的请求/OAuth 实现都已接入 pi-durable；
这些实现位于本包之外。以下保留上游文档内容。

导入 catalog 不会加载 `.env` 或修改 `process.env`，环境初始化由宿主显式决定。

### 在线模型生成

CLI 可直接使用环境凭证，或显式选择默认导出 `ModelGenerationHost` 对象的本地
ESM 模块：

```sh
npm run gen:models -w @cloud-pi/catalog -- --provider gitlab-duo --host ./host.mjs --output /tmp/models.json
```

`--host` 相对于命令工作目录解析（`npm run -w` 时为 catalog workspace），必要时
使用绝对路径。可选 hook 为 `discoverAuthStorage()`、`getProviderDefinition(id)`
（可提供 `prepareModelDiscovery(config)`）和同步/异步 `getGitLabDuoModels()`。
认证句柄使用后会关闭，接口见 `scripts/generation-host.ts`，不会隐式加载 omp AI。

执行 `npm run build:scripts -w @cloud-pi/catalog` 后，程序可从
`packages/catalog/dist-scripts/generate-models.js` 导入 `generateModels`，调用
`generateModels({ provider, host, outputPath })`。不传 `outputPath` 时更新
`src/models.json`；验证时应指定临时输出。缺少 hook 时回退到环境认证和现有
快照/种子。生成可能请求网络，不会在导入或构建时自动运行。CLI 显式初始化
dotenv；程序宿主自行决定是否调用 `initializeEnvironment()`。

# @oh-my-pi/pi-catalog

[omp](https://github.com/can1357/oh-my-pi) 的模型目录：内置模型数据库、
provider 发现、模型身份、分类与等价判断。

## 内容

| 模块                            | 用途                                                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `models.json` + `models`        | 内置模型数据库（价格、上下文窗口、模态、思考支持）                                                                                                                            |
| `provider-models`               | Provider 目录描述符（`CATALOG_PROVIDERS`）、按 provider 解析模型的规则                                                                                                       |
| `discovery`                     | OpenAI 兼容端点、Gemini、Codex、Cursor、Antigravity、Ollama 的运行时模型发现                                                                                                  |
| `compat/rules`                  | 受版本管理的 KDL 策略树：taxonomy（classes/families/revisions）、class/provider 级联规则、运行时行为词汇；由 `npm run gen:compat -w @cloud-pi/catalog` 编译为 `rules.json`     |
| `compat`                        | 规则引擎：`classifyModel`（taxonomy）、`resolveModelPolicy`（级联）、行为访问器（`api-routes`、`model-limits`、`exclude-models`、`pricing-peer`）、折叠及消费已解析记录的 OpenAI/Anthropic wire 构造器 |
| `identity`                      | 机械式 id 工具：基于内置索引的引用解析、方言、选择优先级、tokenizer 家族                                                                                                      |
| `model-thinking`                | 基于已解析模型记录的运行时思考辅助（`getSupportedEfforts`、effort 限幅/映射、wire-id 路由）                                                                                  |
| `model-manager` / `model-cache` | 带发现刷新与磁盘缓存的运行时模型注册表                                                                                                                                        |
| `wire`                          | Wire 层辅助：Codex、Gemini headers、GitHub Copilot                                                                                                                            |
| `effort`                        | 推理 effort 级别定义                                                                                                                                                          |

从子路径（`@cloud-pi/catalog/<module>`）或根 barrel 导入。

## models.json 与 rules.json 由生成器产出

不要手工编辑 `src/models.json` 或 `src/compat/rules.json`。`models.json` 是紧凑
生成目录；请使用 `getBundledProviders()` 与 `getBundledModels()`，不要读取其
内部格式。它由 `scripts/generate-models.ts` 从上游来源（stencil.so、provider
目录发现、OpenCode 文档）生成；`rules.json` 由 `src/compat/rules/` 的 KDL 树
编译。重新生成：

```sh
npm run gen:compat -w @cloud-pi/catalog   # KDL 树 -> src/compat/rules.json（含 id 联合）
npm run gen:proto -w @cloud-pi/catalog    # 需要 oh-my-pi 检出来源 .proto 输入
```

此处刻意不重新生成 `src/models.json`：实时生成器需要 omp pi-ai 的
auth/registry 宿主与网络发现。本移植以复制的固定基线数据库为准。

模型或 provider 条件策略（身份、effort 阶梯、wire 特殊行为、模态/限制/价格
修正、API 路由、名单排除）位于 KDL 树中——语法与轴词汇见
`src/compat/rules/README.md`。TypeScript 改动只用于传输机制：provider 条目在
`provider-models/descriptors.ts`，发现/请求管线在
`provider-models/openai-compat.ts`，生成器接线在 `scripts/generate-models.ts`。
修改 `.kdl` 时需同时提交 `rules.json`（数值变化时还需重新生成的
`models.json`）。

## 安装

```sh
npm install @cloud-pi/catalog
```

私有 workspace 包。使用 tsup 构建 ESM 与声明文件，并打包保留的
`@oh-my-pi/pi-utils`/`@oh-my-pi/omptype` 源码，因此安装后的包不需要私有
workspace，也不需要 Bun 运行时。要求 Node.js ≥ 24。

## 费用计算

`models` 子路径（根入口同样导出）提供时间戳感知的计价辅助：

| API                                                               | 结果                                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `calculateCost(model, usage, timestamp?)`                         | 使用 `model.cost` 更新并返回 `usage.cost`。                                                   |
| `calculateUsageCost(cost, usage, timestamp?)`                     | 使用 `ModelCost` 更新并返回 `usage.cost`。                                                    |
| `calculateUncachedInputCost(cost, promptInputTokens, timestamp?)` | 返回完全未缓存提示的费用。                                                                    |
| `getEffectiveTokenCost(cost, timestamp?)`                         | 返回当前生效的基础价目：最晚已生效费率，否则使用行自身的费率。                                |
| `getTimeBasedPricingPeriod(cost, timestamp?)`                     | 无周期性资费时返回 `"peak"`、`"off-peak"` 或 `undefined`。                                     |
| `hasRecurringTariff(schedule)`                                    | `TimeBasedCost` 是否包含峰谷资费，而非仅有按日期费率卡。                                      |
| `getNextTimeBasedPricingTransition(cost, timestamp?)`             | 返回时间戳之后下一次实际峰谷切换；不存在则返回 `undefined`。                                   |

时间戳为 Unix 毫秒；省略时按当前时间处理定时计价。固定 token 价格不受影响。
计价先选择最晚生效的费率卡，再选择其长上下文档，最后应用峰谷倍率。切换查询
针对周期资费，而非按日期费率卡的变化。

`ModelCost.timeBased` 是可选类型化元数据（`TimeBasedCost`）：`offPeakMultiplier`、
`peakWindows`（UTC `weekdays`，周日为 0，以及起含止不含的
`startMinute`/`endMinute`）和可选的 `effectiveRates`。每个生效费率都是完整
`TokenCost`，带 `effectiveFrom` Unix 毫秒时间戳与可选 `longContext` 档，从该
时刻起替换基础卡。没有峰谷窗口且 off-peak 倍率为 1x 的调度没有周期资费，只有
按日期费率卡：`cost-patch`/`cost-fallback` 的 `effective-rates` 会编译成这种
形式，因此计划涨价前构建的行在后续请求中仍按新价目计价。

估算请求用量时传入请求开始时间戳，并保留所得金额，不要在展示时重算历史。
OMP 使用 assistant 消息时间戳；这是估算约定，不代表服务端在边界上的实际计费。
provider 提供实际金额时应优先使用。

调度由 [`time-based-cost` KDL 轴](src/compat/rules/README.md#time-based-pricing)
物化；这不会给编码代理的 `models.yml` 增加 `timeBased` 输入字段。DeepSeek
费率、日期与页脚指示见[面向用户的价格行为](../../docs/models.md#usage-costs-and-time-based-pricing)。

## 参考

- [Monorepo README](https://github.com/can1357/oh-my-pi#readme)
- [CHANGELOG](./CHANGELOG.md)
