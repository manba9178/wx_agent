import { config } from '../config.js';
import { chatCompletion, type ChatMessage } from './llm.js';
import { appendTurn, getHistory, resetSession } from './session.js';
import { runTool, toolSchemas } from './tools/index.js';

const MAX_STEPS = 6;

const SYSTEM_PROMPT = `你是「课题组小助手」，一个运行在企业微信里的 AI 助理。

你的能力：
1. 查天气 —— 用 get_weather 工具查实时天气和未来三天预报
2. 算数 —— 用 calculate 工具做数学运算（大数乘除、开方、百分比等）
3. 查学者 —— 用 get_google_scholar 工具查 Google Scholar 上的引用、h-index、代表作

工作原则：
- 只要问题涉及日期时间、数字计算、天气、学术信息，就调用工具获取事实，绝不凭记忆编造。
- 工具返回结果后，用简洁自然的中文总结给用户，不要直接甩原始数据。
- 企业微信是聊天场景：回复要短，多用短句，不要写长篇大论，不要用 Markdown 表格。
- 用户用中文提问就用中文回答。
- 你无法查询企业通讯录、无法发文件、无法操作别人的账号，遇到这类请求直接说明做不到。`;

export async function runAgent(userId: string, userText: string): Promise<string> {
  const text = userText.trim();
  if (!text) return '';

  if (/^\/(reset|clear|重置|清空)$/i.test(text)) {
    resetSession(userId);
    return '好的，对话上下文已清空，我们重新开始～';
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
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
