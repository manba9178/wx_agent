import type { ToolSchema } from '../llm.js';
import { calculatorTool } from './calculator.js';
import { scholarTool } from './scholar.js';
import { weatherTool } from './weather.js';
import type { Tool } from './types.js';

/** 想加新能力，往这里加一个 Tool 就行 */
export const tools: Tool[] = [weatherTool, calculatorTool, scholarTool];

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
