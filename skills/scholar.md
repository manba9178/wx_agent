---
name: scholar
description: 查询学者的 Google Scholar 信息（所属机构、研究方向、引用总数、h-index、代表作）
---

# 技能：查询 Google Scholar 学者信息

国内网络无法直连 `scholar.google.com`，必须经 **SerpAPI** 中转。
本项目已经把整套流程封装成一个可执行脚本，**用 `run_shell` 调它即可**。

## 做法

```
run_shell({ command: 'node skills/scholar.mjs "Weichen Dai"' })
```

脚本会打印紧凑的英文标签结果，例如：

```
NAME: Weichen Dai
AFFILIATION: Hangzhou Dianzi University
INTERESTS: Computer Vision; Deep Learning
CITATIONS: all=911 since=880
HINDEX: all=13 since=13
I10: all=15 since=15
PROFILE: https://scholar.google.com/citations?hl=en&user=xxxx
PAPER1: ... (2023) cited=342
```

## 关键要求

1. **传拼音姓名，不要传中文名。** Google Scholar 主页几乎都是英文名，
   传中文名搜不到。例如「戴玮辰」→ `Weichen Dai`、「张三」→ `San Zhang`。
2. 脚本输出是**英文标签**，你要**翻译成中文**再回给用户（引用总数、h-index、i10、代表作）。
3. 如果脚本输出 `NOT_FOUND: xxx`，说明没找到主页，请让用户提供更精确的姓名，
   或直接给出主页链接里的 `user=` ID（12 位大小写混排，如 `JicYPdAAAAAJ`）——可用下面的方式直接查：

```
run_shell({ command: 'node skills/scholar.mjs "JicYPdAAAAAJ"' })
```

## 依赖

- 环境变量 `SERPAPI_KEY`（已配在 `.env`）。服务进程会自动把它传给子进程，无需你手动处理。
- 如果脚本报 `ERROR: 未设置环境变量 SERPAPI_KEY`，就告诉用户去 `.env` 里补上。

## 备用方案（不用脚本）

也可以直接用 `web_fetch` 调 SerpAPI 接口自己解析：
`https://serpapi.com/search.json?engine=google_scholar_author&hl=en&author_id=<ID>&api_key=<KEY>`。
但脚本已经处理了"搜主页 → 核对姓名 → 拉统计"的全流程，优先用脚本。
