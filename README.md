# wx-agent · 接在企业微信里的自建 Agent

一个跑在**企业微信**里的 AI 助理：你在企业微信里给它发消息，它调用 LLM + 工具帮你**查天气、算数、查 Google Scholar**，再把结果回给你。

对应任务：*"写一个 agent 接入你们自己的微信，类似写一个你们自己的 openclaw"*。

---

## 一、整体架构（先看懂这张图，后面都是照做）

```
┌─────────────┐   1. 用户发消息      ┌──────────────────────┐
│  企业微信App │ ──────────────────▶ │  企业微信服务器        │
│  (工作台/群聊)│                     │  (回调推送)           │
└─────────────┘                     └──────────┬───────────┘
       ▲                                       │ 2. POST 加密XML
       │ 5. 收到回复                            ▼
       │                            ┌──────────────────────────────┐
       │                            │  你的服务器 (本项目)          │
       │                            │  /wecom/callback             │
       │                            │   ① 验签 + 解密              │
       │                            │   ② 立刻返回 200 (5秒限制)    │
       │                            │   ③ 丢给 Agent 异步处理       │
       │                            │        │                     │
       │                            │        ▼                     │
       │                            │   Agent 大脑 (LLM 工具调用)   │
       │                            │   ├─ get_weather  查天气     │
       │                            │   ├─ calculate    算数       │
       │                            │   └─ get_google_scholar      │
       │                            └──────────┬───────────────────┘
       │                                       │ 4. 调 message/send API
       └───────────────────────────────────────┘
```

**两个关键设计点**（面试/验收会被问）：

1. **必须"先响应、再异步回复"**：企业微信要求回调 5 秒内返回，LLM 不可能这么快。所以我们在收到消息后立刻返回空串，处理完再用 `message/send` 主动推给用户，**不能走被动回复 XML**。
2. **消息加解密**：企业微信回调是 AES-256-CBC + SHA1 签名的加密 XML，本项目的 `src/wecom/crypto.ts` 是官方 `WXBizMsgCrypt` 的 Node 实现（32 字节 PKCS#7 填充，注意不是常见的 16）。

---

## 二、目录结构

```
wx_agent/
├─ src/
│  ├─ index.ts              # 入口：Express 服务 + 消息处理接线
│  ├─ config.ts             # 环境变量读取 + 启动体检
│  ├─ wecom/
│  │  ├─ crypto.ts          # 企业微信回调加解密（核心）
│  │  ├─ callback.ts        # 回调路由：URL验证 / 收消息
│  │  ├─ api.ts             # access_token + 发消息
│  │  └─ types.ts
│  ├─ agent/
│  │  ├─ agent.ts           # Agent 主循环（LLM ↔ 工具）
│  │  ├─ llm.ts             # OpenAI 兼容 LLM 客户端
│  │  ├─ session.ts         # 多轮对话记忆
│  │  └─ tools/
│  │     ├─ index.ts        # 工具注册表（加工具改这里）
│  │     ├─ weather.ts      # 查天气（Open-Meteo，免 Key）
│  │     ├─ calculator.ts   # 算数（mathjs 白名单作用域）
│  │     └─ scholar.ts      # Google Scholar
│  └─ dev/
│     ├─ chat.ts            # 本地终端交互调试（不用配企业微信）
│     └─ demo.ts            # 一键跑完验收三条任务
├─ .env.example
└─ package.json
```

---

## 三、5 分钟先把它跑起来（不用碰企业微信）

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
```

编辑 `.env`，**最少只填这 3 行**就能本地聊天：

```ini
LLM_BASE_URL=https://api.deepseek.com/v1   # 也可换通义/智谱/OpenAI
LLM_API_KEY=sk-你的key
LLM_MODEL=deepseek-chat
```

然后：

```bash
npm run chat
```

```
你 > (1234*5678)+99 等于多少
助手 > 1234×5678 = 7006652，再加 99 等于 7006751。

你 > 今天北京天气怎么样
助手 > 北京现在晴间多云，25.9°C，体感 27.1°C……
```

**这一步跑通了，说明 Agent 大脑没问题，剩下的只是"接线"到企业微信。**

想一键跑完验收三条任务，用：

```bash
npm run demo                      # 自动跑「查天气 / 算数 / 查 Scholar」三条
npm run demo -- "上海明天会下雨吗"  # 也可以跑自定义问题
```

---

## 四、正式接入企业微信（详细步骤）

### 0. 前置条件

- 一个企业微信账号（**个人也能免费注册**：<https://work.weixin.qq.com/>，注册时选"企业"随便填个名）
- 你是该企业的**管理员**
- 一个**公网可访问的地址**（本地开发用内网穿透，见第 5 步）

---

### 1. 拿到企业 ID（corpid）

管理后台 → **我的企业** → **企业信息** → 拉到底 → **企业ID**

形如 `ww1234567890abcdef`，填进 `.env` 的 `WECOM_CORP_ID`。

---

### 2. 创建自建应用，拿 AgentId / Secret

管理后台 → **应用管理** → **应用** → 「自建」那一栏 → **创建应用**

- 上传 logo、应用名称（比如"课题组小助理"）
- **可见范围**：勾上你自己和课题组成员（决定谁能用）
- 创建完成后进入应用详情页，抄下两个值：
  - **AgentId**（形如 `1000002`）→ `WECOM_AGENT_ID`
  - **Secret**（点"获取"，只显示一次，泄露了可以重置）→ `WECOM_SECRET`

---

### 3. 配置「接收消息」回调（最关键的一步）

在同一个应用详情页 → 找到 **接收消息** → **设置 API 接收**

会弹出一个表单，三行：

| 字段 | 填什么 |
|---|---|
| **URL** | `https://你的公网域名/wecom/callback` |
| **Token** | 点「随机获取」，然后**原样复制**到 `.env` 的 `WECOM_CALLBACK_TOKEN` |
| **EncodingAESKey** | 点「随机获取」（会得到 43 位），**原样复制**到 `.env` 的 `WECOM_ENCODING_AES_KEY` |

填好 `.env` 后，**先把服务启动起来**：

```bash
npm run dev
```

服务日志会打印 `✅ wx-agent 已启动`。此时**再回后台点「保存」**——企业微信会立刻向你填的 URL 发一个 GET 请求做验证，验证通过才会提示"保存成功"。

> 保存失败排查：
> - 报"请检查URL是否可用" → 服务没起来 / 内网穿透断了 / 路径不是 `/wecom/callback`
> - 报"回调模式配置失败" → Token 或 EncodingAESKey 粘错了（AESKey 必须是 43 位）
> - 服务日志出现 `URL 验证签名不通过` → Token 填错了

---

### 4. 配置「企业可信IP」（不配会报 60020）

应用详情页 → **开发者接口** → **企业可信IP** → 填你服务器的**公网出口 IP**。

不配的话，发消息 API 会返回：

```
errcode: 60020, errmsg: not allow to access from your ip
```

本地开发如果不确定出口 IP，可以先访问 <https://ifconfig.me> 查，或者临时把穿透服务的 IP 填进去。

---

### 5. 内网穿透（把本地服务暴露到公网）

企业微信必须能访问到你的回调地址。本地开发三选一：

| 工具 | 特点 | 命令示例 |
|---|---|---|
| **cpolar** | 国内、免费、有 https | `cpolar http 3000` |
| **natapp** | 国内、免费隧道 | `natapp -authtoken=xxx` |
| **frp** | 自己有服务器就用这个 | `frpc -c frpc.ini` |

拿到类似 `https://xxxx.cpolar.cn` 的地址后，回调 URL 就填：

```
https://xxxx.cpolar.cn/wecom/callback
```

> ⚠️ 免费版穿透域名会变，**变一次就要回企业微信后台重填一次 URL**。演示前一天记得确认地址没变。

---

### 6. 发起对话

两种方式都能用：

**方式 A · 单聊**：手机/桌面企业微信 → **工作台** → 找到你的应用 → 点进去发消息。

**方式 B · 群聊（更接近"群机器人"的体验）**：在企业微信里建一个群 → **群设置 → 群机器人 → 添加** → 选你的自建应用 → 然后在群里 `@应用名` 提问。

日志里看到这样一行就说明链路通了：

```
[wecom] <- ZhangSan: 今天北京天气怎么样
[agent] 调用工具 get_weather {"city":"北京"}
[wecom] -> ZhangSan: 北京现在晴间多云...
```

---

## 五、验收演示（对着导师的要求逐条演示）

| 导师要求 | 演示话术 | 预期表现 |
|---|---|---|
| **查天气** | `上海明天会下雨吗` | 调用 `get_weather`，给出天气 + 未来三天 + 降水概率 |
| **算数** | `(1234*5678)+99 等于多少` | 调用 `calculate`，返回 `7006751`（不是模型心算） |
| **查 Google Scholar** | `查一下我的 Google Scholar`<br>`戴玮辰的引用有多少` | 调用 `get_google_scholar`，返回引用数 / h-index / i10 / 代表作 |
| **多轮上下文** | 先问`北京天气`，再问`那明天呢` | 能接上下文 |
| **兜底** | 随便闲聊 / 问它做不到的事 | 正常对话，不编造数据 |

**演示前必做**：

1. `.env` 里填好导师的 Scholar ID —— 打开导师主页，URL 里 `user=` 后面那串就是，填到 `SCHOLAR_USER_ID`。
2. Google Scholar 反爬很凶，**强烈建议配 `SERPAPI_KEY`**（<https://serpapi.com> 免费 100 次/月），否则服务器 IP 直接抓大概率被拦。
3. `npm run chat` 先把三条演示话术各跑一遍，确认都正常再上线。

---

## 六、我想改点什么

| 需求 | 改哪里 |
|---|---|
| 换 AI 模型 | `.env` 的 `LLM_BASE_URL` / `LLM_MODEL`（任何 OpenAI 兼容接口都行） |
| 改人设/语气 | `src/agent/agent.ts` 里的 `SYSTEM_PROMPT` |
| 加一个新工具（比如查课表） | 在 `src/agent/tools/` 新建文件实现 `Tool` 接口，然后在 `tools/index.ts` 的数组里加一行 |
| 换会话存储 | `src/agent/session.ts`（现在是内存 Map，重启就丢，生产请换 Redis/SQLite） |
| 限制模型能用的工具 | `src/agent/agent.ts` 里给 `toolSchemas()` 加过滤 |

---

## 七、常见问题

**Q：为什么不直接接个人微信？**
个人微信没有官方 API，第三方方案（wechaty/puppet、hook 注入）都属于**违反微信协议**，账号随时被封。企业微信是腾讯官方开放的合规通道，这才是"接入自己的微信"的正确解法。

**Q：`errmsg: invalid ip xxx, not in whitelist`？**
就是第 4 步的「企业可信IP」没配。

**Q：回复很慢？**
LLM 本身要 2~5 秒。想要更好的体验可以在 `index.ts` 里收到消息后先回一句"🤔 正在处理…"再回结果（多一次 API 调用）。

**Q：Google Scholar 抓不到？**
配 `SERPAPI_KEY`。或者用一个更稳的替代方案：直接写死几位目标学者的 `SCHOLAR_USER_ID`。

**Q：企业微信后台保存回调 URL 一直失败？**
按第 3 步的排查清单走，90% 是 Token/AESKey 粘错，或者服务压根没启动。

**Q：启动报 `EADDRINUSE: address already in use :::3000`？**
3000 端口被别的程序占了（本机就有一个）。改 `.env` 里的 `WECOM_PORT=3300` 重启即可，注意内网穿透的端口要跟着改。

**Q：日志里中文是乱码？**
Windows 控制台编码问题，不是代码问题。执行 `chcp 65001` 切到 UTF-8 即可。
