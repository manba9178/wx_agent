import { config } from '../config.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ChatCompletionResponse {
  choices: Array<{ message: ChatMessage; finish_reason: string }>;
  error?: { message: string };
}

/**
 * 调用 OpenAI 兼容的 /chat/completions。
 * DeepSeek / 通义千问兼容模式 / 智谱 / Kimi / OpenAI 都走这一套。
 */
export async function chatCompletion(
  messages: ChatMessage[],
  tools?: ToolSchema[],
): Promise<ChatMessage> {
  if (!config.llm.apiKey) throw new Error('LLM_API_KEY 未配置');

  const body: Record<string, unknown> = {
    model: config.llm.model,
    messages,
    temperature: 0.3,
  };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const response = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`LLM 请求失败 ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const message = data.choices?.[0]?.message;
  if (!message) {
    throw new Error(`LLM 返回格式异常: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return message;
}
