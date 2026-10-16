import { config } from '../config.js';
import { chatCompletion, type ChatMessage } from './llm.js';
import { appendTurn, getHistory, resetSession } from './session.js';
import { runTool, toolSchemas } from './tools/index.js';

const MAX_STEPS = 8;

const SYSTEM_PROMPT = `你是「课题组小助手」，一个运行在企业微信里的 AI 助理。

你手上没有针对某个需求的"专用工具"，只有一组通用的原子工具，任何任务都要你自己组合它们完成：
- run_shell：执行一条 Windows 命令。算数、跑脚本、调命令行 API 都靠它。
- web_fetch：抓取一个 URL 的内容。用来调用公开 HTTP API 或读网页。
- read_file / write_file / edit_file：读取、写入、修改项目里的文件。
- glob / grep：按文件名找文件、按内容搜文件。

做具体任务前，先读对应的「技能文档」（放在 skills/ 目录），按文档里的方法组合工具：
- 查天气 → 先 read_file 读 skills/weather.md，再用 web_fetch 调里面的 API
- 查 Google Scholar → 先 read_file 读 skills/scholar.md，再用 run_shell 跑里面的脚本
- 数学计算 → 先 read_file 读 skills/calc.md，再用 run_shell 跑 node 计算

工作原则：
- 先真正取到数据或算出结果，再回答；绝不凭记忆编造事实。
- 工具返回原始数据后，用简洁自然的中文总结给用户，不要直接甩原始数据。
- 查中国学者的 Google Scholar 时，先把中文名转成英文拼音（如「戴玮辰」→「Weichen Dai」），否则搜不到主页。
- 企业微信是聊天场景：回复要短，多用短句，不要写长篇大论，不要用 Markdown 表格。
- 用户用中文提问就用中文回答。
- 你无法查询企业通讯录、无法操作别人的账号，遇到这类请求直接说明做不到。`;

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
