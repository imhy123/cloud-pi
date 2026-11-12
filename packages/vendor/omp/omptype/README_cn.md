# @oh-my-pi/omptype（内置副本）

私有 Node.js workspace，内置 `@cloud-pi/catalog` 使用的 `oh-my-pi`
`packages/omptype` 运行时。保留原有 ArkType 兼容 schema API、惰性 JIT 行为、
JSON Schema 支持及校验器测试。

- 基线：`oh-my-pi` 标签 `v18.18.7`，提交 `e325ffc73ab86e03bdd20a91b77d8e2b3964c906`。
- 清单：`src/`、移植的核心测试与 JSON Schema fixture；见 `SOURCES.json`。
- 移除 Bun：`Bun.FormDataEntryValue` 改为 DOM 的 `string | File` 类型。
- 测试：`test/*.test.ts` 由 Vitest 运行；`test/infer.type-test.ts` 为编译期
  断言文件，由 `npm run typecheck` 覆盖。上游 `test/ark/` 兼容矩阵未内置，
  因为它测试外部 ArkType 包而非本运行时。

构建：`npm run build -w @oh-my-pi/omptype`。
测试：`npm run test -w @oh-my-pi/omptype`。
来源审计：`npm run audit:upstream -w @oh-my-pi/omptype`。
