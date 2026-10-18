import { config } from '../config.js';
import { chatCompletion, type ChatMessage } from './llm.js';
import { appendTurn, getHistory, resetSession } from './session.js';
import { runTool, toolSchemas } from './tools/index.js';
import { loadSkillIndex, renderSkillIndex } from './skills.js';

const MAX_STEPS = 8;

const BASE_PROMPT = `你是「课题组小助手」，一个运行在企业微信里的 AI 助理。

你手上没有针对某个需求的"专用工具"，只有一组通用的原子工具，任何任务都要你自己组合它们完成：
- run_shell：执行一条 Windows 命令。算数、跑脚本、调命令行 API 都靠它。
- web_fetch：抓取一个 URL 的内容。用来调用公开 HTTP API 或读网页。
- read_file / write_file / edit_file：读取、写入、修改项目里的文件。
- glob / grep：按文件名找文件、按内容搜文件。

工作原则：
- 先真正取到数据或算出结果，再回答；绝不凭记忆编造事实。
- 工具返回原始数据后，用简洁自然的中文总结给用户，不要直接甩原始数据。
- 企业微信是聊天场景：回复要短，多用短句，不要写长篇大论，不要用 Markdown 表格。
- 用户用中文提问就用中文回答。
- 你无法查询企业通讯录、无法操作别人的账号，遇到这类请求直接说明做不到。`;

/**
 * 组装系统提示词：基础人设 + 从 skills/ 目录实时扫出来的技能清单。
 * 清单是运行时生成的，所以往目录里丢新技能文档就立刻生效，这里一行都不用改。
 */
function buildSystemPrompt(): string {
  const index = renderSkillIndex(loadSkillIndex());
  if (!index) return BASE_PROMPT;

  return `${BASE_PROMPT}

可用技能（按需加载，用不上就不要读）：
${index}

用户的需求匹配上面某个技能时，先用 read_file 读那份文档，再按文档里写的方法组合工具完成。
技能文档是「操作手册」不是「答案」——里面写的是调什么 API、跑什么命令，真实数据要你自己去取。
需求不匹配任何技能时，用原子工具自己想办法。`;
}

export async function runAgent(userId: string, userText: string): Promise<string> {
  const text = userText.trim();
  if (!text) return '';

  if (/^\/(reset|clear|重置|清空)$/i.test(text)) {
    resetSession(userId);
    return '好的，对话上下文已清空，我们重新开始～';
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    ...getHistory(userId),
    { role: 'user', content: text },
  ];

  let finalText = '';

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const message = await chatCompletion(messages, toolSchemas());
    const toolCalls = message.tool_calls ?? [];

    if (toolCalls.length === 0) {
      finalText = (message.content ?? '').trim();
      break;
    }

    messages.push(message);
    for (const call of toolCalls) {
      const args = parseArgs(call.function.arguments);
      console.log(`[agent] 调用工具 ${call.function.name} ${JSON.stringify(args)}`);
      const result = await runTool(call.function.name, args);
      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
  }

  if (!finalText) finalText = '抱歉，我没能给出有效回复，请换个说法再试一次。';

  appendTurn(userId, text, finalText);
  return finalText;
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
