import fs from 'node:fs';
import path from 'node:path';
import type { Tool } from './types.js';
import {
  WORKSPACE,
  describeError,
  displayPath,
  globToRegExp,
  readTextFile,
  resolveInWorkspace,
  truncate,
  walkFiles,
} from './workspace.js';

const MAX_READ = 12000;

/** read_file：读取项目内某个文件的文本内容（含 skills/ 技能文档） */
export const readFileTool: Tool = {
  name: 'read_file',
  description:
    '读取项目目录内某个文件的文本内容。技能文档放在 skills/ 目录（如 skills/weather.md），做任务前先读它。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '相对项目根目录的路径，例如 skills/scholar.md' },
    },
    required: ['path'],
  },

  async run(args) {
    try {
      const abs = resolveInWorkspace(String(args.path ?? ''));
      const text = await readTextFile(abs);
      if (text === null) return `${displayPath(abs)} 看起来是二进制文件，未读取。`;
      return truncate(`【${displayPath(abs)}】\n${text}`, MAX_READ);
    } catch (error) {
      return `读取失败：${describeError(error)}`;
    }
  },
};

/** write_file：整份写入/覆盖（新建文件时用） */
export const writeFileTool: Tool = {
  name: 'write_file',
  description: '把文本整份写入项目目录内的某个文件（会覆盖原内容；目录不存在会自动创建）。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '相对项目根目录的文件路径' },
      content: { type: 'string', description: '要写入的完整文本内容' },
    },
    required: ['path', 'content'],
  },

  async run(args) {
    try {
      const abs = resolveInWorkspace(String(args.path ?? ''));
      const content = String(args.content ?? '');
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await fs.promises.writeFile(abs, content, 'utf8');
      return `已写入 ${displayPath(abs)}（${Buffer.byteLength(content, 'utf8')} 字节）`;
    } catch (error) {
      return `写入失败：${describeError(error)}`;
    }
  },
};

/** edit_file：精确字符串替换（改已有文件优先用它，比整份覆盖安全） */
export const editFileTool: Tool = {
  name: 'edit_file',
  description:
    '在项目目录内的文件中，把 old_string 精确替换为 new_string（改文件用这个，比 write_file 整份覆盖更安全）。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '相对项目根目录的文件路径' },
      old_string: { type: 'string', description: '要被替换的原文（必须与文件内容完全一致，含缩进）' },
      new_string: { type: 'string', description: '替换成的新文本' },
      replace_all: { type: 'boolean', description: '是否替换所有出现，默认只替换第一处' },
    },
    required: ['path', 'old_string', 'new_string'],
  },

  async run(args) {
    try {
      const abs = resolveInWorkspace(String(args.path ?? ''));
      const oldStr = String(args.old_string ?? '');
      const newStr = String(args.new_string ?? '');
      if (!oldStr) return 'old_string 不能为空。';

      const text = await readTextFile(abs);
      if (text === null) return `${displayPath(abs)} 是二进制文件或不存在，无法编辑。`;

      const count = text.split(oldStr).length - 1;
      if (count === 0) return `在 ${displayPath(abs)} 中没找到要替换的内容，请先 read_file 确认原文。`;

      const replaceAll = Boolean(args.replace_all);
      const updated = replaceAll ? text.split(oldStr).join(newStr) : text.replace(oldStr, newStr);
      await fs.promises.writeFile(abs, updated, 'utf8');
      return `已修改 ${displayPath(abs)}（替换 ${replaceAll ? count : 1} 处）`;
    } catch (error) {
      return `编辑失败：${describeError(error)}`;
    }
  },
};

/** glob：按文件名通配符找文件 */
export const globTool: Tool = {
  name: 'glob',
  description: '按文件名通配符查找文件（支持 *、**、?），返回相对路径列表。例如 "**/*.ts"、"skills/*.md"。',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: '通配符模式，例如 **/*.ts' },
      path: { type: 'string', description: '可选：只在某个子目录下搜索，默认整个项目' },
    },
    required: ['pattern'],
  },

  async run(args) {
    try {
      const pattern = String(args.pattern ?? '').trim() || '**/*';
      const base = args.path ? resolveInWorkspace(String(args.path)) : WORKSPACE;
      const re = globToRegExp(pattern);
      const files = await walkFiles(base);
      const hits = files.map((f) => displayPath(f)).filter((rel) => re.test(rel)).sort();

      if (!hits.length) return `没有匹配 ${pattern} 的文件。`;
      const shown = hits.slice(0, 200);
      const more = hits.length > shown.length ? `\n…（共 ${hits.length} 个，已显示前 ${shown.length} 个）` : '';
      return truncate(`${hits.length} 个文件：\n${shown.join('\n')}${more}`);
    } catch (error) {
      return `查找失败：${describeError(error)}`;
    }
  },
};

/** grep：按正则搜索文件内容 */
export const grepTool: Tool = {
  name: 'grep',
  description: '在项目目录内按正则搜索文件内容，返回 "文件:行号: 内容"。适合定位代码/文档里的关键字。',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: '正则表达式，例如 "run_shell" 或 "TODO|FIXME"' },
      path: { type: 'string', description: '可选：限定在某个子目录搜索' },
      include: { type: 'string', description: '可选：只搜匹配该通配符的文件，例如 "*.ts"' },
      max_results: { type: 'number', description: '最多返回多少条，默认 100' },
    },
    required: ['pattern'],
  },

  async run(args) {
    try {
      const pattern = String(args.pattern ?? '');
      if (!pattern) return 'pattern 不能为空。';
      const re = new RegExp(pattern, 'i');

      const base = args.path ? resolveInWorkspace(String(args.path)) : WORKSPACE;
      const includeRe = args.include ? globToRegExp(String(args.include)) : null;
      const asked = Number(args.max_results);
      const limit = Number.isFinite(asked) && asked > 0 ? asked : 100;

      const files = await walkFiles(base);
      const results: string[] = [];

      for (const file of files) {
        if (results.length >= limit) break;
        const rel = displayPath(file);
        if (includeRe && !includeRe.test(rel) && !includeRe.test(path.basename(file))) continue;

        let text: string | null;
        try {
          text = await readTextFile(file);
        } catch {
          continue;
        }
        if (text === null) continue;

        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length && results.length < limit; i += 1) {
          if (re.test(lines[i])) results.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
        }
      }

      if (!results.length) return `没有匹配 ${pattern} 的内容。`;
      return truncate(results.join('\n'));
    } catch (error) {
      return `搜索失败：${describeError(error)}`;
    }
  },
};
