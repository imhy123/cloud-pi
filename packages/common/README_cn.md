# @cloud-pi/common

为所有 cloud-pi 客户端（终端、Web、桌面）提供可本地化文本、错误、类型化消息目录、语言与本地化格式化。
没有运行时依赖；所有语言数据和格式化都来自 `Intl`。

## 来源

vendor 自 [pi](https://github.com/badlogic/pi-mono) 的
[`@earendil-works/chord`](https://github.com/badlogic/pi-mono/tree/main/packages/chord)
客户端 surface，均为 MIT 许可：

- 源文件：`packages/chord/src/surfaces/{messages,language,translations,format}.ts`
- 上游：pi tag `v1.5.2`（chord `1.5.2`）
- 许可：MIT（见 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)）

chord 发布包的根入口确实导出了这些能力，但根入口同时携带整个应用框架（host、
registry、store、link）。客户端只渲染消息，因此 vendor 这四个文件，而不是把整个
框架拉进来。

有意的偏离（记录在各文件头部）：

- `messages.ts`：去掉 Chord contracts 依赖与 `MessageSchema`（没有 Chord link 把消息
  作为数据传递），命名空间校验改为本地实现。
- `translations.ts`：去掉 `Translations` registry 及其 facet；catalog 通过
  `composeTranslations` 从普通列表组合。
- `language.ts`：去掉 report 的 `plugin` 归属，并适配注释。
- `format.ts`：保留格式化行为，适配说明注释。

## API

```ts
import { composeTranslations, createLanguage, defineMessages, formatNumber, inLanguage, resolveLocale } from "@cloud-pi/common";

const t = defineMessages("client-tui", {
	en: {
		"welcome.tip": "Tip: Ctrl+C exits Cloud-Pi.",
		"chat.youSaid": (text: string) => `You said: ${text}`,
	},
	"zh-CN": {
		"welcome.tip": "提示：Ctrl+C 退出 Cloud-Pi。",
		"chat.youSaid": (text: string) => `你说：${text}`,
	},
});

const language = createLanguage("zh-CN", composeTranslations([...t.translations]), report => console.warn(report));
console.log(inLanguage(language, () => t("welcome.tip")));
console.log(inLanguage(language, () => t("chat.youSaid", "hi")));
```

- `defineMessages(namespace, catalogs)` —— 第一份 catalog 定义 key 与参数类型，其它
  catalog 必须与之一致（缺 key、未知 key、参数错误都是类型错误）。值可以是函数，
  因此复数与语序写在 catalog 里，而不是交给解析器。
- `createLanguage(locale, translations, report)` —— 一个 locale、它的回退链
  （`pt-BR`、`pt`）、书写方向以及 catalog 覆盖。`report` 收到
  `fallback` / `failed` / `unknown` 事件。
- `resolveLocale(pick, preferred, offered)` / `matchLocale(...)` —— 从用户选择或设备
  偏好列表里挑出第一个 catalog 支持的 locale。
- `inLanguage(language, render)` / `currentLanguage()` —— 同步的渲染作用域；`t` 在调用
  时读取当前语言，因此绝不能在模块顶层求值并缓存 catalog 的输出。
- `composeTranslations(list, report?)` —— 合并来自多个模块的 catalog；先到者胜，
  `override: true` 覆盖没有该标记的 catalog。
- `formatTime(value, options?)` / `formatNumber(value, options?)` —— 当前语言的
  `Intl` 格式化。

## 使用

包直接暴露 TypeScript 源码（`exports` 指向 `src/index.ts`），客户端无需构建步骤：

```jsonc
// apps/<client>/package.json
"dependencies": { "@cloud-pi/common": "0.0.0" }
```

```jsonc
// tsconfig.base.json
"paths": { "@cloud-pi/common": ["packages/common/src/index.ts"] }
```

保持 `@cloud-pi/tui` 与 locale 无关：locale 与 catalog 属于客户端，这样库的输出不会
随宿主环境漂移。

包内相对导入带 `.ts` 后缀，因此在不使用打包器时也能在纯 Node 24（原生类型擦除）中
加载。TypeScript 使用方需要在编译选项里开启 `allowImportingTsExtensions`；
`tsconfig.base.json` 已开启，并同时配置了 `@cloud-pi/common` 的路径映射。

`npm install` 会链接 workspace（`node_modules/@cloud-pi/common`），这是裸包名在运行时
能够解析的前提。

## 约定

- catalog 只放纯文本——绝不包含 ANSI 转义；颜色与宽度由 `theme.fg()` /
  `visibleWidth()` 在渲染时处理。
- 不翻译标识符：命令名与别名、主题名、模型 id、按键 id、`SelectItem.value`；只翻译
  `label`/`description`/`hint`。
- 缓存渲染行的组件在语言切换时必须失效缓存，与主题切换完全一致。
## 共享文本与错误

`LocalizedText` 包含英文默认文本及可选的带命名空间的 `MessageData`。调用方在
展示时选择对应 catalog；没有匹配翻译时使用默认文本。`LocalizedError` 扩展 `Error`，
携带 `messageData` 并保留可选 `cause`；普通 `message` 用于日志。通过 IPC 或网络传输
错误时，需要显式使用经过校验的数据结构，不能依赖 `Error` 的原型。

`client-tui` catalog 保存终端专属文本，客户端宿主可使用，但不能作为 Web 或桌面
界面的默认文案。平台语言检测和配置加载由各宿主负责。

客户端文案统一位于 `src/i18n/client-messages.ts` 的 `client-tui` 命名空间；
分组和错误 key 分别使用 `settings.group.*`、`settings.error.*`。
