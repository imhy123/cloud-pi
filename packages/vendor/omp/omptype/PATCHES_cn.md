# 修改记录

基线：`oh-my-pi` `v18.18.7`（`e325ffc73ab86e03bdd20a91b77d8e2b3964c906`）
的 `packages/omptype`。未列出的文件为逐字副本；`SOURCES.json` 记录每个文件
的哈希与类型。

- `src/infer.ts`、`src/keywords.ts`：`Bun.FormDataEntryValue` 改为 DOM 的
  `string | File` 类型。
- `test/*.test.ts`：`bun:test` 改为 `vitest`；`Bun.Glob`、`Bun.file`、
  `Bun.argv` 改为 Node fs/argv 等价实现，断言不变。
- `test/infer.type-test.ts`：由 `infer.test.ts` 改名，避免 Vitest 报告空测试
  套件；编译期断言不变。
- 不内置 `test/ark/` 及 TypeBox/Zod/ArkType 外部矩阵。
- `package.json`：使用私有 Node.js workspace 元数据替代 Bun 清单。
