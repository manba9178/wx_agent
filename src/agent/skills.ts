import fs from 'node:fs';
import path from 'node:path';

/**
 * 技能（skill）索引。
 *
 * 一个 skill = skills/ 目录里的一份 Markdown 文档，顶部用 frontmatter 声明元信息：
 *
 *   ---
 *   name: weather
 *   description: 查询城市实时天气和未来三天预报
 *   ---
 *
 * 这里采用的是 progressive disclosure（渐进式披露）：
 *   1. 每次对话只把「名字 + 一句话描述」注入提示词（几十 token，很便宜）
 *   2. 模型看到清单后自己判断该加载哪一份
 *   3. 只有真正需要时才用 read_file 读全文（这时才花大 token）
 *
 * 这样加一个新技能 = 往 skills/ 丢一个带 frontmatter 的 .md，
 * 不需要改提示词、不需要注册、不需要重启——目录本身就是注册表。
 */

const SKILLS_DIR = 'skills';

export interface SkillMeta {
  /** 技能名，展示在清单里给模型看 */
  name: string;
  /** 一句话描述。模型完全靠它判断"该不该加载这份技能"——写得好不好直接决定命中率 */
  description: string;
  /** 相对项目根的路径，可以直接喂给 read_file */
  docPath: string;
}

/** 解析 Markdown 顶部的 frontmatter。只支持简单的 key: value，不引 YAML 依赖。 */
function parseFrontmatter(content: string): Record<string, string> | null {
  const matched = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!matched) return null;

  const meta: Record<string, string> = {};
  for (const line of matched[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([\w-]+)\s*:\s*(.+?)\s*$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '');
  }
  return meta;
}

/**
 * 扫描 skills/ 目录，读出所有技能的元信息。
 * 每次请求都重新扫——刻意不缓存，这样运行中往目录里丢新文件也能立刻生效。
 */
export function loadSkillIndex(): SkillMeta[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  } catch {
    console.warn(`[skills] 目录 ${SKILLS_DIR}/ 不存在，本次不加载任何技能`);
    return [];
  }

  const skills: SkillMeta[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;

    const docPath = `${SKILLS_DIR}/${entry.name}`;
    let content: string;
    try {
      content = fs.readFileSync(path.join(SKILLS_DIR, entry.name), 'utf8');
    } catch {
      continue;
    }

    const meta = parseFrontmatter(content);
    if (!meta) {
      console.warn(`[skills] ${docPath} 缺少 frontmatter，已跳过（需 --- name/description ---）`);
      continue;
    }

    const description = (meta.description ?? '').trim();
    if (!description) {
      console.warn(`[skills] ${docPath} 缺少 description，已跳过（模型靠它判断要不要加载）`);
      continue;
    }

    skills.push({
      name: (meta.name ?? '').trim() || entry.name.replace(/\.md$/i, ''),
      description,
      docPath,
    });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/** 把技能清单渲染成提示词片段。没有技能时返回空串，调用方直接整段省略。 */
export function renderSkillIndex(skills: SkillMeta[]): string {
  if (skills.length === 0) return '';
  return skills.map((s) => `- ${s.name}：${s.description} → read_file("${s.docPath}")`).join('\n');
}
