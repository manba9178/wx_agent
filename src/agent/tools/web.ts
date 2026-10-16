import type { Tool } from './types.js';
import { MAX_TEXT, truncate } from './workspace.js';

const TIMEOUT_MS = 20_000;

/**
 * web_fetch：通用「联网抓取」工具。
 * 查天气、查学术信息、读任意网页……统一先取数据，再让模型自己组织答案。
 */
export const webFetchTool: Tool = {
  name: 'web_fetch',
  description:
    '发起一个 GET 请求抓取 URL 内容，返回响应文本（JSON / HTML / 纯文本）。' +
    '用来调用公开的 HTTP API（例如天气 API）或读取网页。只支持 http/https 链接。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '要抓取的完整 URL，必须带 http:// 或 https://' },
      maxLength: { type: 'number', description: `最多返回多少字符，默认 ${MAX_TEXT}` },
    },
    required: ['url'],
  },

  async run(args) {
    const raw = String(args.url ?? '').trim();
    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return `URL 不合法：${raw}`;
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return `只支持 http/https 链接，收到的是 ${target.protocol}`;
    }

    try {
      const res = await fetch(target, {
        headers: { 'User-Agent': 'wx-agent/1.0 (+course-project)', Accept: '*/*' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await res.text();
      const asked = Number(args.maxLength);
      const max = Number.isFinite(asked) && asked > 0 ? asked : MAX_TEXT;
      return truncate(`HTTP ${res.status} ${res.statusText}\n${body}`, max);
    } catch (error) {
      return `抓取失败：${(error as Error).message}`;
    }
  },
};
