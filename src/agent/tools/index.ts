import type { ToolSchema } from '../llm.js';
import { editFileTool, globTool, grepTool, readFileTool, writeFileTool } from './fs.js';
import { shellTool } from './shell.js';
import { webFetchTool } from './web.js';
import type { Tool } from './types.js';

/**
 * 通用「原子」工具集。
 *
 * 设计原则（harness 思想）：tool 只提供最基础、可组合的能力，
 * 不针对「查天气 / 算数 / 查学者」这类具体需求写死。
 * 具体任务交给模型自己组合这些原语完成——用到的领域知识放在 skills/ 技能文档里。
 *
 *   web_fetch              → 联网取数（调 API、读网页）
 *   run_shell              → 算数 / 跑脚本 / 调命令行
 *   read/write/edit_file   → 读写、修改项目文件（含 skills/）
 *   glob / grep            → 找文件、搜内容
 *
 * 想扩展能力：优先往 skills/ 加一份技能文档，而不是加新工具。
 */
export const tools: Tool[] = [
  webFetchTool,
  shellTool,
  readFileTool,
  writeFileTool,
  editFileTool,
  globTool,
  grepTool,
];

const registry = new Map(tools.map((tool) => [tool.name, tool]));

/** 转成 OpenAI function-calling 的 tools 参数 */
export function toolSchemas(): ToolSchema[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = registry.get(name);
  if (!tool) return `未知工具：${name}`;

  try {
    return await tool.run(args);
  } catch (error) {
    console.error(`[tool] ${name} 执行失败:`, error);
    return `工具 ${name} 执行失败：${(error as Error).message}`;
  }
}
