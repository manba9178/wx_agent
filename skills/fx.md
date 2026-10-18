---
name: fx
description: 查询实时汇率并做货币换算（美元、欧元、日元等兑人民币）
---

# 技能：汇率换算

数据源：frankfurter.app（免费、无需 API Key，数据来自欧洲央行）。

## 做法

用 `web_fetch` 抓取：

```
https://api.frankfurter.app/latest?from=<原币种>&to=<目标币种>
```

币种用大写代码：`USD`、`CNY`、`EUR`、`JPY`、`GBP`。

要换算具体金额时带上 `amount`，返回的 `rates` 里直接就是换算后的结果：

```
https://api.frankfurter.app/latest?from=USD&to=CNY&amount=100
```

## 注意

- 数据源只覆盖欧洲央行公布的币种，不含加密货币。
- 如果用户问的币种不在支持列表里，如实说明查不到。

## 输出要求

直接给出换算结果，并附上汇率日期。中文短句，不要贴原始 JSON。
