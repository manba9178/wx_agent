import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Tool } from './types.js';
import { WORKSPACE, truncate } from './workspace.js';

const execAsync = promisify(exec);
const TIMEOUT_MS = 20_000;
const MAX_COMMAND = 2000;

/**
 * 危险命令黑名单：拦住"一键毁盘"级别的误操作。
 * 注意这只是兜底护栏，不是密不透风的沙箱——真正的边界是"不要执行不可信输入"。
 */
const DENY_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bformat\s+[a-z]:/i, why: '格式化磁盘' },
  { re: /\bdiskpart\b/i, why: '磁盘分区工具' },
  { re: /\bshutdown\b|\bStop-Computer\b|\bRestart-Computer\b/i, why: '关机/重启' },
  { re: /\brm\s+-rf?\s+[\/~]/i, why: '删除根目录' },
  { re: /Remove-Item[^\n]*-Recurse/i, why: '递归删除文件' },
  { re: /\bdel\s+\/[sfq]\b/i, why: '强制删除文件' },
  { re: /\breg\s+delete\b/i, why: '删除注册表项' },
  { re: /\bnet\s+user\b|\bnet\s+localgroup\b/i, why: '修改系统账号' },
  { re: /\bvssadmin\b|\bcipher\s+\/w\b/i, why: '删除卷影备份' },
];

/**
 * run_shell：通用「命令行」工具。
 * 算数、写脚本、调命令行 API、处理文件……都靠模型自己写命令来完成。
 * 这是把"每个功能写一个模块"换成"给一只手"的关键。
 */
export const shellTool: Tool = {
  name: 'run_shell',
  description:
    '在项目目录下执行一条 Windows 命令（走 cmd.exe），返回标准输出。' +
    '这是你的"手"：数学计算（node -e "console.log(1+2)"）、跑脚本、调用命令行 API、处理文件都靠它。' +
    '多步任务可以分多次调用。',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的完整命令，例如 node -e "console.log((1234*5678)+99)" 或 node skills/scholar.mjs "Weichen Dai"',
      },
    },
    required: ['command'],
  },

  async run(args) {
    const command = String(args.command ?? '').trim();
    if (!command) return '命令为空。';
    if (command.length > MAX_COMMAND) return `命令过长（上限 ${MAX_COMMAND} 字符）。`;

    for (const { re, why } of DENY_PATTERNS) {
      if (re.test(command)) return `出于安全考虑，已拒绝执行该命令（识别到：${why}）。`;
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: WORKSPACE,
        timeout: TIMEOUT_MS,
        maxBuffer: 1_000_000,
        windowsHide: true,
      });
      const out = [stdout, stderr]
        .map((s) => s.trim())
        .filter(Boolean)
        .join('\n');
      return truncate(out || '(命令执行成功，但没有输出)');
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; message?: string; killed?: boolean };
      const detail = [e.stdout, e.stderr]
        .map((s) => (s ?? '').trim())
        .filter(Boolean)
        .join('\n');
      if (e.killed) return truncate(`命令超时（超过 ${TIMEOUT_MS / 1000} 秒）已被终止。\n${detail}`);
      return truncate(`命令执行失败：${e.message ?? '未知错误'}\n${detail}`);
    }
  },
};
