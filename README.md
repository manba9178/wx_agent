<div align="center">

# wx-agent

**一个接在企业微信里的 LLM Agent**

用 TypeScript 手写 Agent 内核，通过企业微信官方协议收发消息。
工具层只提供通用的基础原语，由模型自己组合它们完成任务；领域知识以纯文本技能文档的形式存在，新增能力通常不需要改代码。

[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)

</div>

---

## 目录

- [简介](#简介)
- [特性](#特性)
- [架构](#架构)
  - [消息链路](#消息链路)
  - [Agent 内核](#agent-内核)
  - [工具层](#工具层)
  - [技能文档](#技能文档)
- [快速开始](#快速开始)
- [配置](#配置)
- [使用](#使用)
- [接入企业微信](#接入企业微信)
- [工具参考](#工具参考)
- [项目结构](#项目结构)
- [开发](#开发)
- [安全](#安全)
- [常见问题](#常见问题)
- [许可证](#许可证)

---

## 简介

你在企业微信里给一个自建应用发消息，它会：

1. 收到消息 → 2. 交给大模型 → 3. 模型**自己决定**要不要用工具、用哪些 →
4. 执行工具 → 5. 模型把结果组织成自然语言 → 6. 主动发回给你。

它的核心是一个手写的决策循环：

```
用户输入 ──▶ 系统提示词 + 历史 + 工具清单 ──▶ 大模型
                                              │
                        ┌─────────────────────┴─────────────────────┐
                        │ 不要工具：直接回文字                        │
                        │ 要工具：回 {"name":..., "arguments":...}   │
                        └─────────────────────┬─────────────────────┘
                                              ▼
                                    执行工具（取真实数据）
                                              │
                                              ▼
                                    结果塞回对话，再问一次
                                    （最多循环 8 次）
```

内置的能力示例：查天气、做数学运算、查 Google Scholar 学者信息、汇率换算。
这些能力都不是写死在代码里的，而是模型读取 `skills/` 下的文档后自行组合工具完成的。

---

## 特性

| | 说明 |
|---|---|
| 🧠 **手写 Agent 内核** | 不依赖 LangChain 等框架，LLM 调用、决策循环、工具注册、记忆全部自实现 |
| 🧩 **通用工具层** | 只注册 7 个基础原语，不含任何业务逻辑 |
| 📚 **技能文档** | 领域知识写在 `skills/*.md`，模型自己读取并照做 |
| 🔌 **模型无关** | 走 OpenAI 兼容协议，DeepSeek / 通义 / 智谱 / OpenAI 换配置即可 |
| 💬 **企业微信原生** | 官方通道：回调加解密 + `message/send` 主动推送，支持单聊与群聊 |
| 🛡 **安全护栏** | 文件操作沙箱化、命令黑名单、超时与输出截断 |
| 🧪 **本地可调** | `npm run chat` 在终端直接对话，**不需要配企业微信** |

---

## 架构

### 消息链路

```
┌─────────────┐  1. 用户发消息     ┌──────────────────────┐
│  企业微信App │ ────────────────▶ │  企业微信服务器        │
│ (工作台/群聊)│                    │  (回调推送)           │
└─────────────┘                    └──────────┬───────────┘
       ▲                                       │ 2. POST 加密 XML
       │ 5. 收到回复                            ▼
       │                            ┌──────────────────────────────┐
       │                            │  你的服务器（本项目）          │
       │                            │  POST /wecom/callback        │
       │                            │   ① 验签 + AES 解密           │
       │                            │   ② 立刻返回 200（5 秒限制）   │
       │                            │   ③ 异步交给 Agent 处理        │
       │                            │        ▼                     │
       │                            │   Agent 大脑（LLM ↔ 工具）     │
       │                            │   ├─ web_fetch   联网取数      │
       │                            │   ├─ run_shell   执行命令      │
       │                            │   └─ read/write/glob/grep     │
       │                            └──────────┬───────────────────┘
       │                                       │ 4. 调 message/send API
       └───────────────────────────────────────┘
```

企业微信侧有两个绕不开的约束：

1. **先响应、再异步回复**。回调要求 **5 秒内**返回，而 LLM 通常需要更久。
   所以收到消息后立刻返回空串，处理完再用 `message/send` 主动推给用户，不走被动回复 XML。
2. **消息加解密**。回调体是 AES-256-CBC + SHA1 签名的加密 XML，
   `src/wecom/crypto.ts` 是官方 `WXBizMsgCrypt` 的 Node 实现
   （注意是 32 字节 PKCS#7 填充，不是常见的 16）。

### Agent 内核

内核由四个零件组成：

| 零件 | 文件 | 作用 |
|---|---|---|
| LLM 调用 | `src/agent/llm.ts` | OpenAI 兼容 `/chat/completions`，带 `tools` 参数 |
| 决策循环 | `src/agent/agent.ts` | 观察 → 决定 → 调工具 → 再观察，最多 8 轮 |
| 工具注册表 | `src/agent/tools/index.ts` | 工具名册 + 统一调度 + 异常兜底 |
| 记忆 | `src/agent/session.ts` | 按用户保存最近 6 轮对话（内存 Map） |

```ts
// src/agent/agent.ts —— 内核就是这个循环
for (let step = 0; step < MAX_STEPS; step += 1) {
  const message = await chatCompletion(messages, toolSchemas());
  const toolCalls = message.tool_calls ?? [];

  if (toolCalls.length === 0) {
    finalText = (message.content ?? '').trim();
    break;
  }

  messages.push(message);
  for (const call of toolCalls) {
    const args = parseArgs(call.function.arguments);   // 只是 JSON.parse
    const result = await runTool(call.function.name, args);
    messages.push({ role: 'tool', tool_call_id: call.id, content: result });
  }
}
```

意图识别、工具选择、参数填写**全部由模型完成**，代码中没有关键词路由或正则抽参。

### 工具层

工具层对外只暴露基础能力，不含业务逻辑：

| 工具 | 能力 |
|---|---|
| `web_fetch` | GET 任意 http/https URL |
| `run_shell` | 执行一条命令 |
| `read_file` / `write_file` / `edit_file` | 读写与修改文件 |
| `glob` / `grep` | 按文件名找文件、按内容搜文件 |

### 技能文档

领域知识以纯文本形式放在 `skills/`，**一个 `.md` 文件就是一项技能**：

```
skills/
├─ weather.md     # 查天气：Open-Meteo 的 API 地址 + WMO 天气码对照表
├─ calc.md        # 算数：用 node 计算的命令示例
├─ scholar.md     # 查学者：脚本用法说明
├─ fx.md          # 汇率换算：frankfurter API
└─ scholar.mjs    # 查学者脚本（多步调用 SerpAPI）
```

每份文档顶部用 frontmatter 声明元信息：

```markdown
---
name: weather
description: 查询城市实时天气和未来三天预报（温度、体感温度、降水概率、风力）
---
```

`src/agent/skills.ts` 会在**每次请求时**扫描这个目录，把「名字 + 一句话描述」组装成清单注入提示词，
然后由模型**自己判断**要不要用 `read_file` 加载某一份的全文：

```
用户提问 → 模型看清单（只有名字和一句话，很便宜）
         → 判断匹配哪个技能
         → read_file 读该文档全文
         → 按文档写的步骤组合原子工具执行
```

这个思路叫 **progressive disclosure**（渐进式披露）：先给便宜的摘要，需要时才加载昂贵的全文。

因为清单是扫描目录得来的，**新增一项能力 = 往 `skills/` 丢一个带 frontmatter 的 `.md`**：
不改提示词、不注册、不重启，下一次对话就能用。

一次真实调用的过程：

```
用户: 今天北京天气怎么样？
[agent] 调用工具 read_file {"path":"skills/weather.md"}
[agent] 调用工具 web_fetch {"url":"https://geocoding-api.open-meteo.com/v1/search?..."}
[agent] 调用工具 web_fetch {"url":"https://api.open-meteo.com/v1/forecast?..."}
助手: 北京今天阴天，气温约 17℃，体感约 13℃。未来三天……

用户: (1234*5678)+99 等于多少？
[agent] 调用工具 read_file {"path":"skills/calc.md"}
[agent] 调用工具 run_shell {"command":"node -e \"console.log((1234*5678)+99)\""}
助手: (1234×5678)+99 = 7006751
```

工具层不认识"天气"或"算数"，它只提供取数和执行命令的能力；怎么组合由模型读完文档后决定。

---

## 快速开始

```bash
git clone <your-repo-url>
cd wx-agent
npm install
cp .env.example .env          # Windows: copy .env.example .env
```

编辑 `.env`，最少填 LLM 三行即可：

```ini
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=sk-你的key
LLM_MODEL=deepseek-chat
```

在终端直接对话：

```bash
npm run chat
```

```
你 > (1234*5678)+99 等于多少
助手 > (1234×5678)+99 = 7006751

你 > 今天北京天气怎么样
助手 > 北京现在阴天，17℃，体感 13℃……
```

这一步不需要配置企业微信。确认 Agent 行为正常后，再按[接入企业微信](#接入企业微信)接线。

---

## 配置

复制 `.env.example` 为 `.env` 后按需填写。启动时 `assertConfig()` 会检查必填项，缺失时直接打印提示。

| 变量 | 必填 | 说明 |
|---|---|---|
| `LLM_BASE_URL` | ✅ | OpenAI 兼容接口地址，末尾不带 `/` |
| `LLM_API_KEY` | ✅ | 模型 API Key |
| `LLM_MODEL` | ✅ | 模型名，如 `deepseek-chat` |
| `WECOM_CORP_ID` | 企微 | 企业 ID（`ww` 开头） |
| `WECOM_AGENT_ID` | 企微 | 自建应用 AgentId |
| `WECOM_SECRET` | 企微 | 自建应用 Secret |
| `WECOM_CALLBACK_TOKEN` | 企微 | 回调 Token |
| `WECOM_ENCODING_AES_KEY` | 企微 | 回调 AESKey，**必须 43 位** |
| `WECOM_PORT` | ➖ | 服务端口，默认 `3000` |
| `SERPAPI_KEY` | ➖ | 查 Google Scholar 用到，免费额度 100 次/月 |

---

## 使用

| 命令 | 作用 |
|---|---|
| `npm run chat` | 终端里与 Agent 对话 |
| `npm run demo` | 依次跑三个示例问题 |
| `npm run demo -- "上海明天会下雨吗"` | 跑自定义问题 |
| `npm run dev` | 启动服务（`tsx watch` 热重载） |
| `npm start` | 启动服务 |
| `npm run typecheck` | 类型检查 |

对话中输入 `/reset`（或 `/clear`、`重置`、`清空`）可清空当前会话上下文。

Windows 下另有几个辅助脚本，用于配合内网穿透调试：

| 脚本 | 作用 |
|---|---|
| `start.bat` | 启动服务 + cloudflared 隧道 |
| `status.bat` | 查看服务与隧道状态 |
| `get-url.bat` | 读取当前公网地址并复制到剪贴板 |
| `stop.bat` | 停止服务与隧道 |

---

## 接入企业微信

### 1. 创建自建应用

管理后台 → 应用管理 → 应用 → 自建 → 创建应用。
记下 **AgentId** 和 **Secret**；企业 ID 在「我的企业 → 企业信息」底部。

### 2. 配置接收消息回调

应用详情 → 接收消息 → 设置 API 接收：

| 字段 | 填什么 |
|---|---|
| URL | `https://你的公网域名/wecom/callback` |
| Token | 点「随机获取」，填到 `WECOM_CALLBACK_TOKEN` |
| EncodingAESKey | 点「随机获取」（43 位），填到 `WECOM_ENCODING_AES_KEY` |

先把服务跑起来（`npm run dev`），**再回后台点保存**：企业微信会立刻 GET 该 URL 做验证。

### 3. 配置企业可信 IP

应用详情 → 开发者接口 → 企业可信 IP → 填公网出口 IP。
不配会报 `errcode: 60020, not allow to access from your ip`。

### 4. 内网穿透

企业微信需要能访问到回调地址，本地开发需要有公网地址：

| 工具 | 命令 |
|---|---|
| cloudflared（仓库内含 `cloudflared.exe`） | `cloudflared tunnel --url http://localhost:3000` |
| cpolar | `cpolar http 3000` |
| ngrok | `ngrok http 3000` |

> ⚠️ 免费穿透的域名会变，域名变了需要回后台更新回调 URL。

### 5. 发起对话

- **单聊**：企业微信 → 工作台 → 你的应用 → 发消息
- **群聊**：建群 → 群设置 → 群机器人 → 添加应用 → 在群里 `@应用名` 提问

---

## 工具参考

### `web_fetch`

发起 GET 请求抓取 URL 内容。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `url` | string | ✅ | 完整 URL，仅支持 http / https |
| `maxLength` | number | ➖ | 最多返回字符数，默认 8000 |

### `run_shell`

在项目目录下执行一条命令（Windows 走 `cmd.exe`），返回标准输出。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `command` | string | ✅ | 完整命令，长度上限 2000 字符 |

### `read_file`

读取项目内某个文本文件。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `path` | string | ✅ | 相对项目根目录的路径 |

### `write_file`

整份写入文件（覆盖原内容，目录不存在时自动创建）。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `path` | string | ✅ | 相对项目根目录的路径 |
| `content` | string | ✅ | 完整文本内容 |

### `edit_file`

把 `old_string` 精确替换为 `new_string`。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `path` | string | ✅ | 相对项目根目录的路径 |
| `old_string` | string | ✅ | 要替换的原文，需与文件内容完全一致 |
| `new_string` | string | ✅ | 替换后的文本 |
| `replace_all` | boolean | ➖ | 是否替换全部匹配，默认只替换第一处 |

### `glob`

按通配符查找文件，返回相对路径列表。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `pattern` | string | ✅ | 支持 `*`、`**`、`?`，如 `**/*.ts` |
| `path` | string | ➖ | 限定在某个子目录内搜索 |

### `grep`

按正则搜索文件内容，返回 `文件:行号: 内容`。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `pattern` | string | ✅ | 正则表达式 |
| `path` | string | ➖ | 限定在某个子目录内搜索 |
| `include` | string | ➖ | 只搜匹配该通配符的文件，如 `*.ts` |
| `max_results` | number | ➖ | 最多返回条数，默认 100 |

---

## 项目结构

```
wx-agent/
├─ src/
│  ├─ index.ts                 # 入口：Express 服务 + 消息处理接线
│  ├─ config.ts                # 环境变量读取 + 启动检查
│  ├─ agent/
│  │  ├─ agent.ts              # Agent 主循环 + 系统提示词
│  │  ├─ llm.ts                # OpenAI 兼容 LLM 客户端
│  │  ├─ session.ts            # 多轮对话记忆
│  │  ├─ skills.ts             #   扫描 skills/ 目录，生成技能清单
│  │  └─ tools/
│  │     ├─ index.ts           #   工具注册表
│  │     ├─ types.ts           #   Tool 接口定义
│  │     ├─ web.ts             #   web_fetch
│  │     ├─ shell.ts           #   run_shell
│  │     ├─ fs.ts              #   read/write/edit_file + glob + grep
│  │     └─ workspace.ts       #   沙箱路径 / 输出截断
│  ├─ wecom/
│  │  ├─ crypto.ts             # 回调加解密（WXBizMsgCrypt 的 Node 实现）
│  │  ├─ callback.ts           # 回调路由：URL 验证 / 收消息
│  │  ├─ api.ts                # access_token 缓存 + 发消息
│  │  ├─ tunnel.ts             # 读取当前公网地址
│  │  └─ types.ts
│  └─ dev/
│     ├─ chat.ts               # 终端交互调试
│     └─ demo.ts               # 批量跑示例问题
├─ skills/                     # 技能文档（一个 .md = 一项技能）
│  ├─ weather.md
│  ├─ calc.md
│  ├─ scholar.md
│  ├─ fx.md
│  └─ scholar.mjs
├─ .env.example
├─ tsconfig.json
├─ LICENSE
└─ README.md
```

---

## 开发

新增能力时，优先在 `skills/` 添加技能文档，而不是新增工具。新建一个 `.md`，顶部写好 frontmatter，正文写清楚"用哪些工具、按什么步骤做"：

```markdown
---
name: course
description: 一句话说清这项技能解决什么问题、什么时候该用它
---

# 技能：……

正文写清楚：调什么 API / 跑什么命令、参数怎么填、结果怎么整理。
```

保存即生效——不需要改提示词、不需要注册、不需要重启服务。`description` 写得好不好直接决定模型能不能正确匹配到它。

确实需要新的基础能力时，实现 `Tool` 接口并注册到 `src/agent/tools/index.ts`：

```ts
export interface Tool {
  name: string;                                        // 工具名
  description: string;                                 // 描述「什么时候用」，影响模型是否调用
  parameters: Record<string, unknown>;                 // JSON Schema 参数定义
  run(args: Record<string, unknown>): Promise<string>; // 执行，返回纯文本给模型
}
```

其他常见改动位置：

| 想改什么 | 改哪里 |
|---|---|
| 人设 / 语气 | `src/agent/agent.ts` 的 `BASE_PROMPT` |
| 循环轮数上限 | `src/agent/agent.ts` 的 `MAX_STEPS`（当前 8） |
| 记忆轮数 / 存储方式 | `src/agent/session.ts`（当前为内存 Map，重启丢失） |
| 换模型 | `.env` 的 `LLM_BASE_URL` / `LLM_MODEL` |

---

## 安全

工具层能执行命令与读写文件，因此设置了三层护栏：

| 层 | 措施 |
|---|---|
| 文件系统 | 路径经 `resolveInWorkspace()` 解析，越出项目目录直接拒绝 |
| 命令执行 | `run_shell` 维护危险命令黑名单（`format` / `shutdown` / `Remove-Item -Recurse` / `reg delete` 等），20 秒超时 |
| 输出长度 | 工具返回值统一截断到 8000 字符，避免超大输出灌爆上下文 |

> ⚠️ 以上是护栏而非沙箱。若在生产环境开放 `run_shell`，建议配合容器或受限系统用户使用。

---

## 常见问题

**Q：为什么不接个人微信？**
个人微信没有官方 API，第三方方案（wechaty、hook 注入）都违反微信协议，账号随时可能被封。企业微信是官方开放的合规通道。

**Q：换模型要改代码吗？**
不需要。LLM 交互走 OpenAI 兼容协议，改 `.env` 的 `LLM_BASE_URL` 和 `LLM_MODEL` 即可。

**Q：`errcode: 60020, not allow to access from your ip`？**
企业可信 IP 未配置，见[接入企业微信](#接入企业微信)第 3 步。

**Q：后台保存回调 URL 一直失败？**
多数是 Token / AESKey 粘错，或服务未启动。EncodingAESKey 必须是 43 位。

**Q：Google Scholar 查不到？**
需要配置 `SERPAPI_KEY`（国内无法直连 scholar.google.com，需经 SerpAPI 中转）。
另外查询中国学者要使用拼音名（如戴玮辰 → `Weichen Dai`），中文名匹配不到英文主页。

**Q：回复比较慢？**
LLM 本身需要几秒。服务收到消息后会先回一句"🤔 正在处理…"再回结果。

**Q：`EADDRINUSE: address already in use :::3000`？**
端口被占用。改 `.env` 的 `WECOM_PORT`，内网穿透端口同步修改。

**Q：日志里中文乱码？**
Windows 控制台编码问题，执行 `chcp 65001` 切换到 UTF-8。

---

## 许可证

[MIT](./LICENSE) © 2026 wx-agent contributors
