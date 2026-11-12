# cloud-pi

一个团队与多设备共用的编码 agent：pi 的内核运行在云端，本地只跑瘦客户端，会话可以随时在笔记本和云端之间移交。

**状态：设计阶段，尚无代码。** 本文记录当前的设计设想，包括尚未定下来的部分。

---

## 1. 这是什么

cloud-pi 是 [pi](https://github.com/earendil-works/pi) 的一种发行形态：agent 内核跑在你控制的服务器上，客户端在本地连接它。功能上同时从 pi 和 [oh-my-pi](https://github.com/can1357/oh-my-pi)（一个基于 Bun 的 fork，TUI 更重、agent 功能更多）取材，但主体是 pi。

三个定义性特征：

1. **一套环境，团队共用 / 一人跨设备。** 依赖、凭据、skills、MCP server、仓库 checkout 都在服务端，本地无需逐台配置。
2. **会话可移动。** 在笔记本上 `cloud-pi up` 开始工作，随时把会话移交给云端，合上盖子它继续跑。移交即终结本地能力：此后工具只在服务端执行。
3. **可复现的部署单元 = harness。** 服务端镜像和每个客户端二进制都由同一套声明式包集合构建。第三方用一个签名产物就能分发 skills、MCP server、二进制、配置。
4. **知识集中沉淀在 harness 之外。** harness 保持不可变；一个独立的记忆服务承载团队所学，每个会话（包括面向业务的实例）挂载它被允许看到的层。

### 非目标

- 不做新的 agent 循环、模型层、会话格式。这些 pi 已有。
- 不做终端共享服务。客户端不渲染远程 PTY（见 §4）。
- 不做多租户 PaaS。部署模型是一个团队或一个人跑一台服务器。

---

## 2. 架构

```
                      ┌──────────────────────────────────────────────┐
                      │  云端主机                                     │
                      │                                              │
                      │  ┌────────────┐   stdio JSONL  ┌─────────┐ │
   WebSocket (WSS) ───┼──┤ 网关       ├───┬────────────┤ pi --mode │ │
                      │  │ (成帧/鉴权 │   ├────────────┤ rpc       │ │
                      │  │ /多播/心跳)│   ├────────────┤ (会话)     │ │
                      │  └────────────┘   └────────────┴────┬────┘ │
                      │        │  overlay fs │ rclone/FUSE │ inject │
                      │   harness 镜像    工作区树        registry  │
                      └────────────────────────────────┬─────────┘
                                                       │ 挂载（按 profile）
                                                       ▼
                     ┌─────────────────────────────────────────────┐
                     │  记忆服务（外接，可变）                        │
                     │  raw 层 → 注入层（晋升）                      │
                     └─────────────────────────────────────────────┘

  客户端：pi-tui 终端客户端 · Web 客户端 · electron/tauri 壳（提供本地工具与挂载）
```

自下而上的分层：

| 层 | 内容 | 来源 |
|---|---|---|
| Agent 内核 | 模型路由、工具、会话、压缩、扩展 | pi（不改，`--mode rpc`） |
| 传输 | pi RPC JSONL over WebSocket + 控制信封 | 新建（很薄） |
| 会话视图模型 | 事件 → UI 状态（消息、流式、工具状态、用量、上下文） | 新建，各客户端共用 |
| 客户端 | 终端 UI、Web UI、桌面壳 | pi-tui（终端）+ 新建（Web） |
| Harness | 包格式、构建服务、镜像与二进制装配 | 新建 |
| 记忆 | 团队知识库：摘要、教训、runbook | 新建；外接服务，先用最简存储 |

---

## 3. 术语

- **harness** — 一个部署单元：服务端镜像（云）或客户端二进制（本地）+ 装进去的包集合。同一份 harness 定义，不同 target。
- **harness package（`.hpkg`）** — 类 deb 产物：元数据、载荷（skills/prompts/扩展/MCP/二进制/配置）、按 target 与 arch 的安装规则。
- **会话（session）** — 一段 pi 对话，由其 JSONL 会话文件标识。UI 模式是**进程**的属性而不是会话的属性；任何客户端都能 resume 同一会话。
- **placement** — 一次工具调用在哪里执行：`local` 或 `remote`。
- **handover（移交）** — 会话的 placement 授权权在客户端与云端之间转移。
- **记忆服务（memory service）** — 外接、可变的团队知识存储（摘要、教训、runbook）。会话启动时挂载；永不进入 harness 镜像。
- **visibility（可见性）** — 记忆层的访问级别（`team` / `org` / `external`），挂载时选择。同一镜像，不同挂载 profile。

---

## 4. 传输与协议

### 4.1 保留 pi 的 RPC 协议作为线格式

`pi --mode rpc` 通过 stdin/stdout 讲 JSONL：命令、响应、会话事件，外加一个扩展 UI 的请求/响应子协议。它是**语义化**的（消息、工具调用、状态增量），不是 ANSI。cloud-pi 保留这个接口。

网关为每个会话 spawn 一个 pi 进程，把 JSONL 行以 WebSocket **二进制帧**转发（不要用文本帧，base64 白付 33%），并在两个方向上尊重背压。

在网关侧新增、而不是塞进 pi 的东西：

| 关注点 | 做法 |
|---|---|
| 鉴权 | 连接时 token 或 mTLS，身份绑定到会话 |
| 多路复用 | 初期一个连接 ↔ 一个会话；信封里留 `session` 字段以便扩展 |
| 重连同步 | `get_state` + 重放会话条目重建视图 |
| 存活 | WS ping/pong；断连期间服务端保持 pi 进程存活（tmux 式） |
| 客户端身份/能力 | 带版本的 hello 及确认协商（§4.5）；`cols/rows/theme/dark` 仍作为呈现参考 |

### 4.2 刻意不做 PTY 转发

PTY 管道（ttyd + xterm.js）工作量小得多，而且保真呈现所有视觉细节，但它破坏本项目两个目标：按键回显需要一个完整 RTT，且客户端 UI 不可修改。既然“终端客户端体验要和本地 pi 一致”是既定目标，客户端就必须从语义事件渲染。

### 4.3 代价：RPC 的 UI 缺口

pi 的 RPC 模式会丢弃需要真实终端的 UI 方法（`docs/rpc-extension-ui.md`）：`custom()` 返回 `undefined`；`setFooter`、`setHeader`、`setWorkingMessage/Indicator`、`setEditorComponent`、`addAutocompleteProvider`、主题切换全部 no-op。扩展仍然在服务端加载，只是画不出来。

由此产生、并被本设计接受的结果：

- 呈现归客户端：编辑器、自动补全、对话框、状态栏、spinner。
- 内置 footer 的数据客户端可以从事件流自己算（`message_update.usage`、`message_end`）。扩展若要向客户端传达意图，只能走那条唯一还活着的通道：`setStatus(key, text)` 与 `setWidget(key, string[])`。
- 需要富交互 UI 的扩展必须自带客户端那一半。因此 harness 包允许携带 `client/` 载荷（见 §8）。

**这是整个项目最大的单项工程成本，也是“阶段 1 的终端客户端是一次真正的开发而非套壳”的原因。**

### 4.4 可选第三路径：SSH 零安装

PTY 透传与语义协议之间还有第三种传输：把 TUI **在服务端渲染**，通过 SSH 暴露。
`@opentui/ssh` 为每个连入的 SSH shell 建一个自己的 renderer；团队成员
`ssh team@cloud-host` 就能拿到完整界面——无需安装客户端，任意终端、任意设备。
布局在服务端完成，但按键回显仍需一个往返，所以延迟特性同 PTY 路径（§4.2）——
也和 PTY 透传一样，带不了本地工具和客户端扩展。

定位：给没有安装客户端的人与设备（以及“让我看一眼”的时刻）提供的兑底入口，
不是主路径。仅当 SSH 入口与网关走同一套鉴权时，才与 §10 的关注点兼容。

---

### 4.5 客户端身份与能力协商

以下是设计提案，尚未实现。每条连接在附着会话之前向网关发送 `hello`，声明客户端类型
（`tui`、`web`、`electron`、`im` 或其他注册类型）、应用版本、独立的协议版本、平台元数据及
呈现能力。应用版本用于诊断；兼容性由协议版本和能力确定。

平台采用结构化字段，例如 `{ "os": "linux", "arch": "x64", "distribution": "debian",
"release": "trixie" }`，展示时可派生为 `linux:x64:debian-trixie`。架构使用 `x64`、`arm64`、
`ia32` 等明确名称，避免含糊的 `x86`。浏览器和 IM 客户端可能无法得知设备系统、架构或发行版，
未知字段直接省略，不以网关宿主信息代替。已知的终端产品及版本可作诊断信息，但不能证明支持图片。

简短声明可使用预设加覆盖：

```json
{
  "type": "hello",
  "protocolVersion": 1,
  "client": { "type": "tui", "version": "0.0.0" },
  "platform": { "os": "linux", "arch": "x64", "distribution": "debian", "release": "trixie" },
  "capabilities": {
    "preset": "tui-normal@1",
    "overrides": {
      "images": { "receive": false },
      "limits": { "text": { "max": 16384, "unit": "utf8-bytes" } }
    }
  }
}
```

示例长度仅作说明。预设是不可变、带版本的协议定义，不能随服务端升级悄悄改变含义。
首批预设族建议为：

| 预设 | 目标呈现能力 |
|---|---|
| `tui-normal@1` | 丰富终端 UI、Markdown/代码块、结构化问答；图片仅在实际终端链路支持时启用 |
| `tui-simple@1` | 文本型终端、纯文本代码块及文本问答；不假设内联图片或丰富 UI |
| `im-normal@1` | adapter 提供的渠道格式、图片附件，以及渠道允许的结构化回复 |
| `im-simple@1` | 纯文本及编号/文本回复；不假设丰富格式、图片或按钮 |

统一使用 `tui-simple`，不另引入同义的 `tui-degrade`。Web 和 Electron 可以使用各自带版本的
预设或显式声明。Ghostty/Kitty 可作为 `tui-normal` 的候选，但 SSH、复用器和用户设置可能削弱
实际链路能力。预设是默认值；探测结果和渠道约束必须反映在覆盖字段中，不能仅按产品名启用功能。

展开后的能力结构应区分：

- **媒体：** 图片上传/发送与接收/显示独立声明；包括 MIME 类型及附件/内联呈现。
  能下载文件不等于能显示图片。
- **格式：** 分别声明 Markdown 子集、围栏代码块、语法高亮、链接和表格。
  IM 原生格式由 adapter 映射，不要求等同于完整 Markdown。
- **交互：** 文本回答、单选/多选、表单和审批提示；回复能否携带请求 ID 及显式取消。
  纯文本渠道可使用编号选项，但仍必须处理关联、过期和取消。
- **投递：** 流式更新、编辑已发送消息及附件。
- **限制：** 文本长度必须注明计量单位（`utf8-bytes`、`unicode-code-points` 或
  `utf16-code-units`），另声明附件字节数/数量及格式开销。限制针对每条投递消息，与传输帧
  限制不同。adapter 按实际渠道计数规则执行限制，必要时拆分文本或改为附件。

服务端展开已识别的预设，按字段合并覆盖（数组整体替换），校验限制，再与协议支持、部署策略和
adapter 约束取交集。投递会话事件前，确认协商后的协议版本及最终能力。未知预设或版本不能默认为
“normal”：应要求显式能力声明、协商已知的保守预设，或在必需功能无降级路径时拒绝握手。
未知可选字段不赋予任何能力。

能力属于连接，不属于 transcript 或会话的模型能力。同一语义事件可以在不同客户端呈现为不同
形式。能力改变需要确认更新或重连；尺寸和主题信息可独立更新。不支持的呈现要有明确回退：
代码变纯文本，图片在可用时转为可访问附件/描述，问答变为带关联关系的文本回复。无法可靠呈现的
必需审批应保持待处理或报告不支持，绝不自动批准。客户端声明只描述呈现能力，不授予本地工具
执行权或凭据使用权。

Telegram/WeChat 可以实现为服务端 adapter，但仍代表逻辑上的 `im` 客户端；渠道标识与 adapter
版本要和已知的用户应用版本分开。按会话/投递目标协商，因为渠道与聊天模式的能力可能不同。
上报的是用户侧渠道能力；adapter 宿主平台应与未知的用户设备分开。adapter 鉴权不能代替其所代表
用户及会话的授权。

---

## 5. 客户端

所有客户端消费同一个会话视图模型，只有渲染不同。

| 客户端 | 渲染方式 | 说明 |
|---|---|---|
| 终端 | pi-tui 组件（`Editor`、`Markdown`、`SelectList`） | pi-tui 是 Node/Bun 库，不能跑在浏览器里 |
| Web | React（或同类），同样的视图模型 | 只能走 WS，无本地进程 |
| 桌面 | electron/tauri 包裹 Web 视图 | 增加本地工具、挂载、keychain、通知 |
| IM | 通过 adapter 投递渠道消息并接收回复 | Telegram/WeChat 等集成，按投递目标协商能力（§4.5） |

共享代码以 TS 包形式给出：`protocol`（记录类型）、`client`（命令关联、事件订阅）、`view-model`（事件 reducer），外加各平台的渲染层。

Tauri 注意：内核是 Node/TypeScript，Rust 前端要么手写解析同一套 JSONL，要么跑一个 Node sidecar。Electron 几乎免费拿到导出的 `RpcClient`（把 spawn/stdio 换成 socket 即可）。

### OpenTUI：记录在案的备选，不是当前方案

[OpenTUI](https://github.com/anomalyco/opentui)（Zig 原生内核 + React/Solid 渲染器、
flexbox、生产级 Diff/Code/表格组件）是唯一可信的替代客户端栈。若采用，终端客户端
建在 `@opentui/react` 上，与 web 客户端共享 React 写法和视图模型。代价：

- 复用 pi `modes/interactive`（约 22k 行，经会话门面）这条路没了：终端 UI 重写，
  “体验与本地 pi 一致”（§1 目标 5）放弃；
- `engines.node >= 26.4` 与内核的 Node 24 基线分叉；`.hpkg` 安装规则要为 `client`
  target 增加 runtime 维度。

只在下列触发条件之一成立时切换——记录在案，让它是决策而不是漂移：

1. 阶段 0 发现门面的 UI 差集（§4.3）修补成本超过重写估值；
2. web 客户端先行落地，且团队接受放弃终端一致性。

---

## 6. 会话、placement 与移交

### 6.1 是共存，不是两个进程

pi 的会话文件是 append-only JSONL，**没有跨进程锁**。两个进程写同一个文件会写坏它。所以规则是：**一个会话任何时候只有一个持有它的 pi 进程。**“本地和云端同时可用”指的是一个内核 + 路由到两地的工具，不是两个内核共享一份 transcript。

### 6.2 工具 placement

每次工具调用带一个 placement。默认 placement 来自工具在 harness 包里的声明；会话的 placement 授权权决定实际允许什么。

| 工具类别 | 典型 placement |
|---|---|
| 工作区上的 read/edit/write/grep/bash | `remote`（工作区在服务端） |
| 需鉴权的 CLI（`gh`、`gcloud`）、本地 docker daemon、本地浏览器、本地文件 | `local` |
| 依赖用户机器身份的一切 | `local` |

桌面客户端自己执行 `local` 工具，把结果作为工具结果送回同一份 transcript。这是真实的功能边界而非便利项：不少 CLI 与鉴权流程只能在开发机上跑通。

### 6.3 移交流程

本地 → 云端：

1. 排空：无在飞工具调用，等到 `agent_settled`。
2. 文件对账：仅存在于本地的修改必须在下一次 read 之前进入服务端工作区（见 §7）。
3. 收权：会话 placement 授权权变为 `remote`，`local` 工具转为不可用，客户端停止执行它们。
4. 继续：云端 pi 进程持有同一份 transcript，会话文件格式不变。

云端 → 本地是反向流程，额外一步：本地客户端必须装了同一（或兼容）harness，否则声明为 `local` 的工具缺失。因此移交应当校验包集合并可不匹配时拒绝。

未定（见 §11）：transcript 里已出现的本地路径如何命名空间化；模型后续引用的 `local` 工具结果怎么办。

---

## 7. 文件系统

默认：工作区在服务端；工具在那里跑；编辑器通过挂载查看。

| 机制 | 用途 | 取舍 |
|---|---|---|
| `rclone mount`（SFTP 后端指向网关） | 在 VS Code/Finder 里浏览、比对服务端文件 | 搜索延迟高、fs 事件不可靠、无 inotify → LSP 与 watcher 退化 |
| `sshfs`/其他 FUSE | 同上 | 同上 |
| 同步（mutagen/rsync/watch） | 用本地 fs 语义真正编辑 | 需要冲突策略；两份拷贝 |
| 只让 agent 在服务端编辑，或 VS Code Remote over SSH | 完全不挂载 | 需要能 SSH 进会话容器 |

设计立场：**挂载用于审阅，编辑走同步或 Remote。不要把远程挂载当本地盘使。** 会话级 diff 视图直接从 transcript 出（工具结果里就有改动内容），更便宜且永远正确。

---

## 8. Harness 构建服务与 `.hpkg`

### 8.1 产物形态

一份声明式 manifest，一次构建，多个 target。包结构刻意像 deb：

```
mypkg-1.4.0.hpkg
├── manifest.toml        # id、版本、semver 依赖、签名
├── payloads/
│   ├── skills/          # SKILL.md 树
│   ├── prompts/         # 斜杠命令
│   ├── extensions/      # 服务端 pi 扩展（.ts）
│   ├── client/          # 客户端渲染组件（§4.3）
│   ├── mcp/             # MCP server 配置 + 内置 server
│   ├── config/          # models.json、settings、keybindings、themes
│   └── bin/             # 可执行文件
└── CONTROL              # 安装规则
```

`manifest.toml` 里的安装规则要覆盖设计需要的两个轴：

```toml
[[install]]
target = ["server", "client"]     # 装到哪里
arch   = ["linux/arm64"]          # 二进制适用的架构
path   = "bin/foo"                # 载荷来源
mode   = "executable"

[[install]]
target = ["server"]
path   = "skills/review"
into   = "skills/"                # 落到 harness 的 skills 目录
```

### 8.2 构建服务

`hbs build ./harness.toml` 解析依赖图、校验签名与哈希，产出下列之一：

- **服务端**：Docker 镜像 —— 基础层（pi + 网关）+ 已安装载荷。摘要不可变；部署 = 拉指定 digest。
- **客户端**：自包含二进制（终端）或 app bundle（electron/tauri）。同一套包，只取 `target = client`。

不可变性规则：

- 构建出的 harness 内部记录完整的已解析依赖树与内容哈希（产物里的 lockfile）。
- 运行时不安装任何东西。网关只读挂载镜像。
- 用户定制走 overlay，绝不写进镜像（§9）。
- 回滚 = 跑上一个 digest。

### 8.3 记忆与知识在 harness 之外

harness 镜像只承载**能力**（skills、工具、MCP 接线、配置）。知识与记忆是独立的、可变的服务，会话启动时挂载。三层分离，三种生命周期：

| 层 | 内容 | 可变性 | 所在 |
|---|---|---|---|
| Harness | skills、工具、MCP 接线、配置 | 不可变，digest 锁定 | 镜像（§8.2） |
| 记忆服务 | 摘要、教训、runbook、recap；raw 层与注入层 | 可变，自有生命周期 | 外接服务 |
| 会话 | transcript、工具结果 | append-only | 会话文件 |

为什么切分要严格：

- **消掉不可变性矛盾。** 写入不经过任何构建。按 digest 升级镜像不碰记忆：不重放、不随镜像版本化，记忆的死活与任何 harness 发布解耦。
- **挂载点即权限边界。** 面向业务的实例 = 同一镜像 + 只读、`external` 可见性的记忆层 + 不挂开发凭据；内部会话挂读写、全可见层。内部服务与外部服务是挂载 profile 的差别，不是两套系统。
- **记忆的 schema 是镜像的隐式 API。** skills 和 prompt 假设记忆“长什么样”。`.hpkg` manifest 声明所需的记忆接口版本（`[memory] api = 2`），`hbs` 构建时校验；服务内部可演进，只要读接口兼容。
- **晋升在服务内部，不在构建里。** raw → 注入层的晋升管线（含反馈规则：很少被复用、常被仓库现状推翻的条目自动退出注入名单）是记忆服务的内部机制，与 `hbs` 没有构建时耦合。

运维注意：记忆服务是团队不可再生的资产。镜像随时可以从包重建，记忆不能。它需要备份与可用性关注——起步时最简存储即可（SQLite 够用，oh-my-pi 的 `mnemopi` 后端是参照形态）；检索需求确实超出 SQL 之前不引入向量检索。

---

## 9. 一台云上的多用户

团队成员连接同一台服务器。harness（框架、包携带的 skills 等）对所有人一致；用户之间的差异不能互相泄漏。

两个机制：

1. **身份** — 鉴权得到 user id，绑定到每个会话、写入会话元数据，并决定该会话可以使用谁的凭据。共享一个 `gh` token 是策略决定，不是技术默认值。
2. **overlay 文件系统** — 只读镜像层 + 每用户可写层：

```
   /skills         合并视图
   ├── image:  harness 包（§8）        ← 只读，全员相同
   └── user/<id>/skills/               ← 可写，仅此用户
```

prompts、extensions、config（`models.json`、keybindings、themes）同理。会话目录本来就已按用户分开。实现选项：每会话容器的 overlayfs（隔离强，需要特权配置）、bind-mount + 搜索路径（弱但简单 —— pi 本来就从多个目录发现资源）、或 resource-loader 钩子（最干净：pi 的 `ExtensionContext` 暴露资源路径，且资源可重新发现）。

建议：先用 bind-mount + 每用户目录优先级，因为 pi 的资源发现本来就是分层的；overlayfs 留给网关对 `bash` 本来就该做的容器级隔离。

---

## 10. LLM 访问反射回客户端

某些部署无法从服务端直连 LLM provider（内网隔离、服务端无 key、用户本地跑 `llama.cpp`）。此时客户端的 provider 端点必须能被服务端内核使用。

设计：**做 provider 隧道，不改协议。**

```
pi 内核 → http://127.0.0.1:PORT/v1/...   （云端主机上）
              │  经已有的 WS 反向隧道
              ▼
         客户端 → localhost:8080（llama.cpp / LM Studio / 任意 OpenAI 兼容端点）
```

pi 无需改代码：在 `models.json` 里把 provider 的 baseUrl 指向那个回环地址即可。隧道是网关的一个功能（`pi-tunnel`），并且复用已认证的连接。

要点：

- 流式响应是长连接，隧道不能缓冲，必须传递 abort。
- 客户端的凭据现在要为服务端发起的工作付费。**每会话 token 预算**和一个显式的“允许 provider 中继”开关是必需项，不是可选项。
- 延迟敏感：server→client→local model 每轮 token 流多一跳。本地模型可接受；高 RTT 的托管模型很差。
- 反向情形（服务端 key → 客户端内核）走同一段代码，在“客户端无法直连 provider”时同样有用。

---

## 11. 未决问题

刻意未定：

1. **移交后的 transcript 污染。** 本地工具结果引用了服务端不存在的路径。是命名空间化（`local:/Users/...`）、移交时拷进工作区、还是接受悬空引用让模型自己重新发现？
2. **客户端扩展 UI 契约。** §4.3 里 `client/` 载荷还是空的：包的客户端那一半实现什么 API？能不能沙箱化？
3. **每用户/每主机的会话并发上限。** 一会话一 pi 进程意味着按连接数计量的内存、FD、模型配额。
4. **密钥归属。** provider key 放客户端 keychain、服务端 vault，还是由网关按需下发？这直接影响 §10。
5. **离线模式。** 客户端自带内核不连服务端（同样的会话文件、没有网关）——以现有分层成本很低，但会让行为分叉。
6. **跟踪哪个 pi。** 上游在动，fork 有 rebase 成本。倾向于在 pi 之上做层叠（扩展、包、网关），而不是给它打补丁。
7. **记忆晋升判据。** 什么信号把 raw 条目晋升进注入层（复用率、与仓库现状的冲突），以及如何自动检测过期。反馈规则是自动沉淀不退化为噪声的唯一保障（§8.3）。

---

## 12. 路线图

每个阶段都以“可用”收尾。

**阶段 0 — 协议验证。** 一个客户端：pi-tui 前端驱动 `pi --mode rpc` 子进程走 stdio，不涉及网络。验证视图模型与“footer 缺失”这个问题。
*这是全计划中性价比最高的一项。*

**阶段 1 — 远端内核。** 网关加 WS + 鉴权 + 保活 + 重连同步；终端客户端把传输从 stdio 换成 WS。单用户，一连接一会话。此时你就拥有了远程开发。

**阶段 2 — harness。** `.hpkg` manifest、`hbs build` 出服务端镜像、带 target/arch 的安装规则。按 digest 可复现部署。客户端二进制此阶段仍手工构建。记忆始终外接（§8.3），且可以先于云端独立验证：外挂存储 + prompt 注入，在纯 pi 上就能跑。

**阶段 3 — placement + 移交。** 桌面壳里的本地工具执行、placement 路由、带文件对账的移交流程。未决问题 1 在这一阶段定案。

**阶段 4 — Web 客户端。** 同一视图模型，React 渲染。只走 WS（无本地工具）。文件审阅用挂载或服务端 diff 视图。

**阶段 5 — 多用户。** 身份、每用户 overlay、配额、跨用户的会话列表。

**阶段 6 — provider 隧道。** 从客户端反向转发 OpenAI 兼容端点到服务端。

Web 与移交的先后可以按痛点调换；但“没有桌面壳就不可能移交”，所以阶段 3 通常会把 electron/tauri 的工作提前。

---

## 13. 从两边各取什么

主体是 pi。以下是从 oh-my-pi 引入的候选项，但**只取思路不取代码** —— 它是 Bun-only fork（`engines.bun`、其 agent 包里上千处 `Bun.*` 调用、`bun:sqlite`、发布物是 Bun 编译的单文件二进制），无法靠 import 移植：

| 来自 oh-my-pi | 为何在本项目重要 | 移植形态 |
|---|---|---|
| 模型 role（`modelRoles`，含 `vision` role 与 `read img?q=`） | 让服务端的纯文本模型也能回答图片问题 | 一个设置项 + 一个路由辅助函数 |
| idle recap + `session_recaps` 日志 | 会话寿命长于人时很有价值；recap 可成为跨会话记忆 | 独立扩展或进内核 |
| 记忆后端（`local`、`sharpshooter`、`mnemopi`） | 外接记忆服务的形态与纪律（§8.3） | 参考 + 重新实现 |
| skills、`sandbox`/VM 工具、MCP 运行时 | 正好对应 harness 包的载荷类型 | pi 已有，接进 `.hpkg` 即可 |
| 显式的 history/viewport 渲染契约 | 仅当终端客户端需要长会话保真时才相关 | 参考，不搬代码 |
| status-line 预设、charts、sparkline | RPC 通道传不了的客户端呈现 | 在客户端重新实现 |

刻意**不引入**：Bun 运行时（pi 的 Node 基础让客户端更可移植，终端客户端还要跑在纯 Node 上）、TSP 原生后端、厚重的复用器兼容层、TUI 重写。

---

## 14. 实现前值得一读的材料

- pi：`docs/rpc.md`、`docs/rpc-extension-ui.md`、`docs/json.md`、`docs/virtual-models.md`、`docs/packages.md`、`docs/sdk.md`、`docs/containerization.md`
- pi-tui：`packages/tui/README.md`（组件契约、宽度规则、焦点/IME）
- oh-my-pi：`docs/tui-core-renderer.md`（history/viewport）、`src/config/model-roles.ts`、`src/session/idle-maintenance.ts`、`docs/memory.md`（后端形态、注入纪律）
- 传输参考：ttyd 与 gotty（WS-to-PTY，即我们要拒绝的方案，对照看）、VS Code Remote（§7 的编辑模型）
- opencode（`anomalyco/opencode`）：本项目目标的架构在生产规模上的验证——agent 内核
  作为 HTTP+SSE 服务，TUI/web/desktop 都是纯客户端（本地 TUI 也走 HTTP 连接）；
  `packages/client` 的 service ensure/发现/handoff 与 identity 配对流程是 `cloud-pi up`
  的参照。OpenTUI（`anomalyco/opentui`）是它的终端库，也是 §5 记录在案的备选。

## License

MIT
