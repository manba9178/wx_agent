# 技能：查询天气

数据源：**Open-Meteo**（免费、无需 API Key）。
做法：用 `web_fetch` 依次调两个接口，再把结果整理成中文回答。

## 第 1 步：城市名 → 经纬度

```
https://geocoding-api.open-meteo.com/v1/search?name=<城市名>&count=1&language=zh&format=json
```

- `<城市名>` 直接用中文即可（如 `北京`、`杭州`）。
- 从返回的 `results[0]` 里取 `latitude`、`longitude`、`name`、`admin1`。
- 如果 `results` 为空，说明城市名没匹配上，回答用户"换个更完整的城市名"。

## 第 2 步：经纬度 → 实时天气 + 未来三天

```
https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lon>&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3
```

## 第 3 步：把 weather_code 翻译成中文

| code | 含义 | code | 含义 |
|---|---|---|---|
| 0 | 晴 | 61 / 63 / 65 | 小雨 / 中雨 / 大雨 |
| 1 | 晴间多云 | 66 / 67 | 冻雨 |
| 2 | 多云 | 71 / 73 / 75 | 小雪 / 中雪 / 大雪 |
| 3 | 阴 | 80 / 81 / 82 | 阵雨 / 强阵雨 / 暴雨 |
| 45 / 48 | 雾 / 雾凇 | 95 / 96 / 99 | 雷阵雨（伴冰雹） |
| 51 / 53 / 55 | 毛毛雨 | 56 / 57 | 冻毛毛雨 |

## 输出要求

用中文短句总结：**当前天气 + 温度（体感）+ 未来三天走势**。
企业微信场景要短，不要贴原始 JSON，不要 Markdown 表格。
用户没说城市时默认「北京」。

> 备用方案：如果 `web_fetch` 不方便，也可以用 `run_shell` 跑
> `node -e "fetch('https://geocoding-api.open-meteo.com/v1/search?name=北京&count=1&language=zh').then(r=>r.json()).then(d=>console.log(JSON.stringify(d.results[0])))"`
