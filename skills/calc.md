# 技能：数学计算

**核心原则：不要心算。** 大数乘除、开方、百分比模型很容易算错。
做法：用 `run_shell` 跑 Node 来算（Node 自带 Math），把结果整理成中文返回。

## 常用命令

| 需求 | 命令 |
|---|---|
| (1234*5678)+99 | `node -e "console.log((1234*5678)+99)"` |
| 2 的 10 次方 | `node -e "console.log(2**10)"` |
| 144 的平方根 | `node -e "console.log(Math.sqrt(144))"` |
| 350 的 12% | `node -e "console.log(350*0.12)"` |
| 圆周率保留两位 | `node -e "console.log(Math.round(Math.PI*100)/100)"` |

## 注意

- 乘方用 `**`，**不要用 `^`**（在 JS 里 `^` 是按位异或）。
- 需要更高精度可用 `.toFixed()`，例如 `node -e "console.log((0.1+0.2).toFixed(10))"`。
- 命令返回的数字直接用中文说给用户，不要自己再算一遍。
