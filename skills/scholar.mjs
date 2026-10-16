#!/usr/bin/env node
/**
 * 技能脚本：查询一位学者的 Google Scholar 信息（经 SerpAPI 中转）。
 *
 * 用法：  node skills/scholar.mjs "Weichen Dai"
 * 依赖：  环境变量 SERPAPI_KEY（服务进程已从 .env 载入，子进程会自动继承）
 *
 * 说明：这是一个"脚本技能"，不是注册进工具列表的专用工具。
 *      agent 通过通用的 run_shell 调用它——这正是 harness 的思路：
 *      通用工具 + 可组合的脚本，而不是给每个需求写一个工具。
 */
const key = process.env.SERPAPI_KEY;
if (!key) {
  console.log('ERROR: 未设置环境变量 SERPAPI_KEY');
  process.exit(1);
}

const name = process.argv.slice(2).join(' ').trim();
if (!name) {
  console.log('ERROR: 请提供学者姓名，例如 node skills/scholar.mjs "Weichen Dai"');
  process.exit(1);
}

async function serp(params) {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('api_key', key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

// 1) 解析候选 author id：先搜主页链接，搜不到再退到论文检索
const ids = new Set();

const home = await serp({
  engine: 'google',
  gl: 'us',
  hl: 'en',
  q: `"${name}" site:scholar.google.com/citations`,
});
for (const r of home.organic_results ?? []) {
  const m = r.link?.match(/[?&]user=([A-Za-z0-9_-]+)/);
  if (m) ids.add(m[1]);
}

if (ids.size === 0) {
  const papers = await serp({ engine: 'google_scholar', hl: 'en', q: `"${name}"` });
  for (const r of papers.organic_results ?? []) {
    for (const a of r.publication_info?.authors ?? []) {
      if (a.author_id) ids.add(a.author_id);
    }
  }
}

// 2) 逐个拉主页核对姓名（防止张冠李戴）
const firstToken = name.split(/\s+/)[0].toLowerCase();
for (const id of [...ids].slice(0, 5)) {
  const p = await serp({ engine: 'google_scholar_author', hl: 'en', author_id: id });
  const profileName = p?.author?.name;
  if (!profileName || !profileName.toLowerCase().includes(firstToken)) continue;

  const table = p.cited_by?.table ?? [];
  const stat = (i) => {
    const row = table[i];
    if (!row) return {};
    const val = Object.values(row)[0] ?? {};
    const sinceKey = Object.keys(val).find((k) => k !== 'all');
    return { all: val.all, since: sinceKey ? val[sinceKey] : undefined };
  };
  const citations = stat(0);
  const hIndex = stat(1);
  const i10 = stat(2);

  console.log(`NAME: ${profileName}`);
  if (p.author.affiliations) console.log(`AFFILIATION: ${p.author.affiliations}`);
  if (p.author.interests?.length) {
    console.log(`INTERESTS: ${p.author.interests.map((x) => x.title).join('; ')}`);
  }
  console.log(`CITATIONS: all=${citations.all ?? '-'} since=${citations.since ?? '-'}`);
  console.log(`HINDEX: all=${hIndex.all ?? '-'} since=${hIndex.since ?? '-'}`);
  console.log(`I10: all=${i10.all ?? '-'} since=${i10.since ?? '-'}`);
  console.log(`PROFILE: https://scholar.google.com/citations?hl=en&user=${id}`);
  (p.articles ?? []).slice(0, 5).forEach((a, i) => {
    console.log(`PAPER${i + 1}: ${a.title} (${a.year ?? '-'}) cited=${a.cited_by?.value ?? 0}`);
  });
  process.exit(0);
}

console.log(`NOT_FOUND: ${name}`);
process.exit(0);
