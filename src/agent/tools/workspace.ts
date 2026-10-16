import fs from 'node:fs';
import path from 'node:path';

/** 所有文件/命令类工具的沙箱根目录：进程启动目录（也就是项目根） */
export const WORKSPACE = process.cwd();

/** 返回给模型的文本统一上限，避免超大输出灌爆上下文 */
export const MAX_TEXT = 8000;

export function truncate(text: string, max = MAX_TEXT): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n…（内容过长已截断，原始共 ${text.length} 字符）`;
}

/**
 * 把相对/绝对路径都解析到沙箱内，越界直接抛错。
 * 这是文件类工具的安全边界——agent 只能碰项目目录里的东西。
 */
export function resolveInWorkspace(input: string): string {
  const raw = String(input ?? '').trim();
  if (!raw) throw new Error('路径为空');
  const target = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(WORKSPACE, raw);
  const rel = path.relative(WORKSPACE, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`路径越界：${raw}（只能在项目目录内操作）`);
  }
  return target;
}

/** 转成相对项目根、统一用正斜杠的展示路径 */
export function displayPath(abs: string): string {
  return path.relative(WORKSPACE, abs).replace(/\\/g, '/') || '.';
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', '.turbo']);

/** 递归列出文件（跳过依赖/仓库等大目录），带数量上限防止失控 */
export async function walkFiles(base: string, limit = 6000): Promise<string[]> {
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (out.length >= limit) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= limit) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        await walk(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }

  await walk(base);
  return out;
}

/** glob 模式转正则：支持 **（跨目录）、*（不跨目录）、?（单字符） */
export function globToRegExp(pattern: string): RegExp {
  const p = pattern.replace(/\\/g, '/');
  let re = '';
  for (let i = 0; i < p.length; i += 1) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') {
        i += 1;
        if (p[i + 1] === '/') i += 1;
        re += '(?:.*/)?';
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`, 'i');
}

/** 粗略判断二进制文件（前 1KB 内出现 NUL 字节） */
export function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 1024);
  for (let i = 0; i < n; i += 1) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/** 读文本文件；二进制返回 null */
export async function readTextFile(abs: string): Promise<string | null> {
  const buf = await fs.promises.readFile(abs);
  if (looksBinary(buf)) return null;
  return buf.toString('utf8');
}

/** 把 fs 错误翻成人话 */
export function describeError(error: unknown): string {
  const e = error as NodeJS.ErrnoException;
  if (e.code === 'ENOENT') return '文件或目录不存在';
  if (e.code === 'EISDIR') return '这是一个目录';
  if (e.code === 'EACCES' || e.code === 'EPERM') return '没有权限访问';
  return e.message ?? '未知错误';
}
