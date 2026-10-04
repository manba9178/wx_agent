import { config } from '../../config.js';
import type { Tool } from './types.js';

/**
 * Google Scholar 工具。
 * 国内网络无法直连 scholar.google.com，必须经 SerpAPI 中转（.env 配 SERPAPI_KEY）。
 * 流程：姓名 -> google 引擎搜主页链接 -> 拉候选主页核对姓名 -> 返回统计与代表作。
 */
export const scholarTool: Tool = {
  name: 'get_google_scholar',
  description:
    '查询一位学者在 Google Scholar 上的公开学术信息，包括引用总数、h-index、i10-index、研究方向和代表作论文。' +
    '当用户问「查一下 XX 的 Google Scholar」「XX 有多少引用」「他的代表作是什么」时必须调用本工具。',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description:
          '学者姓名，或 Google Scholar 用户ID（主页 URL 里 user= 后面那串）。' +
          '用户没指明具体是谁时留空，会使用配置中的默认学者。',
      },
    },
    required: [],
  },

  async run(args) {
    const query = String(args.name ?? '').trim();
    const target = query || config.scholar.name || config.scholar.userId;

    if (!target) {
      return '暂未配置要查询的学者。请在 .env 里填写 SCHOLAR_NAME 或 SCHOLAR_USER_ID，或直接告诉我要查谁。';
    }
    if (!config.scholar.serpApiKey) {
      return '未配置 SERPAPI_KEY，无法查询 Google Scholar。请在 .env 中填写 SerpAPI 的 API Key 后重试。';
    }

    const authorId = await resolveAuthorId(target);
    if (!authorId) {
      return `没有在 Google Scholar 上找到「${target}」的主页，请给出更精确的姓名或用户ID。`;
    }

    return viaSerpApi(authorId);
  },
};

/** 判断是否为 Scholar 用户ID（12位左右，字母数字下划线） */
function isUserId(value: string): boolean {
  return /^[A-Za-z0-9_-]{10,16}$/.test(value) && !value.includes(' ');
}

async function resolveAuthorId(target: string): Promise<string> {
  if (isUserId(target)) return target;
  if (config.scholar.userId && target === config.scholar.name) return config.scholar.userId;

  const id = await resolveAuthorIdViaSerpApi(target);
  return id ?? config.scholar.userId ?? '';
}

/**
 * 按姓名解析作者 ID：搜候选主页链接，逐个拉主页核对姓名，
 * 防止搜索引擎返回无关学者的主页（张冠李戴）。
 */
async function resolveAuthorIdViaSerpApi(target: string): Promise<string | undefined> {
  const candidates = await searchAuthorCandidatesViaSerpApi(target);
  if (!candidates.length) return undefined;

  for (const id of candidates.slice(0, 3)) {
    const profile = await fetchAuthorProfileViaSerpApi(id);
    if (profile?.author?.name && nameMatches(profile.author.name, target)) return id;
  }
  return undefined;
}

/** 用 google 引擎搜 Scholar 主页链接，返回候选 user id 列表 */
async function searchAuthorCandidatesViaSerpApi(target: string): Promise<string[]> {
  // 引号版是稳定路径；无引号版在 Google 结果波动时兜底
  const queries = [`"${target}" site:scholar.google.com/citations`, `${target} site:scholar.google.com/citations`];

  for (const q of queries) {
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google');
    // 必须加 gl=us + hl=en：默认地域参数下搜索引擎会丢词返回无关结果（实测）
    url.searchParams.set('gl', 'us');
    url.searchParams.set('hl', 'en');
    url.searchParams.set('q', q);
    url.searchParams.set('api_key', config.scholar.serpApiKey!);

    try {
      const data = (await (await fetch(url, { signal: AbortSignal.timeout(25_000) })).json()) as {
        organic_results?: Array<{ link?: string }>;
      };
      const ids = (data.organic_results ?? [])
        .map((r) => r.link?.match(/[?&]user=([A-Za-z0-9_-]+)/)?.[1])
        .filter((v): v is string => Boolean(v));
      const unique = [...new Set(ids)];
      if (unique.length) return unique;
    } catch {
      // 超时/网络错误 -> 试下一个写法
    }
  }
  return [];
}

/** 拉取作者主页（google_scholar_author 引擎） */
async function fetchAuthorProfileViaSerpApi(authorId: string): Promise<SerpAuthorProfile | undefined> {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_scholar_author');
  url.searchParams.set('hl', 'zh-CN');
  url.searchParams.set('author_id', authorId);
  url.searchParams.set('api_key', config.scholar.serpApiKey!);

  try {
    return (await (await fetch(url, { signal: AbortSignal.timeout(25_000) })).json()) as SerpAuthorProfile;
  } catch {
    return undefined;
  }
}

/** 姓名匹配：查询词的每个部分都出现在主页姓名里（不区分大小写） */
function nameMatches(profileName: string, query: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z\u4e00-\u9fa5]+/g, ' ').trim();
  const q = norm(query).split(/\s+/).filter(Boolean);
  const p = norm(profileName);
  return q.length > 0 && q.every((token) => p.includes(token));
}

interface SerpAuthorProfile {
  error?: string;
  author?: {
    name?: string;
    affiliations?: string;
    interests?: Array<{ title: string }>;
  };
  cited_by?: { table?: Array<Record<string, { all?: number; since?: number }>> };
  articles?: Array<{ title: string; year?: string; cited_by?: { value?: number } }>;
}

async function viaSerpApi(authorId: string): Promise<string> {
  const data = await fetchAuthorProfileViaSerpApi(authorId);
  if (!data) return `Google Scholar 查询超时，请稍后重试。`;
  if (data.error) return `Google Scholar 查询失败：${data.error}`;

  const author = data.author ?? {};
  const table = data.cited_by?.table ?? [];
  // 按位置解析：table[0]=引用 [1]=h-index [2]=i10（避免 hl 本地化导致字段名变中文）
  // 值对象形如 { all: 1091581, "2021_年至今": 626413 }，since 取非 all 的那个键
  const statOf = (index: number): { all?: number; since?: number } | undefined => {
    const row = table[index];
    if (!row) return undefined;
    const value = Object.values(row)[0] as Record<string, number | undefined> | undefined;
    if (!value || typeof value !== 'object') return undefined;
    const sinceKey = Object.keys(value).find((k) => k !== 'all');
    return { all: value.all, since: sinceKey ? value[sinceKey] : undefined };
  };
  const citations = statOf(0);
  const hIndex = statOf(1);
  const i10 = statOf(2);

  const lines = [
    `【${author.name ?? authorId} 的 Google Scholar】`,
    author.affiliations ? `单位：${author.affiliations}` : '',
    author.interests?.length ? `研究方向：${author.interests.map((i) => i.title).join('、')}` : '',
    `引用总数：${citations?.all ?? '-'}（近五年 ${citations?.since ?? '-'}）`,
    `h-index：${hIndex?.all ?? '-'}（近五年 ${hIndex?.since ?? '-'}）`,
    `i10-index：${i10?.all ?? '-'}（近五年 ${i10?.since ?? '-'}）`,
  ].filter(Boolean);

  const top = (data.articles ?? []).slice(0, 5);
  if (top.length) {
    lines.push('代表作（按引用排序）：');
    top.forEach((article, index) => {
      lines.push(`  ${index + 1}. ${article.title}${article.year ? ` (${article.year})` : ''} — 被引 ${article.cited_by?.value ?? 0}`);
    });
  }

  lines.push(`主页：https://scholar.google.com/citations?hl=zh-CN&user=${authorId}`);
  return lines.join('\n');
}
