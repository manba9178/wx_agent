import type { ChatMessage } from './llm.js';

/**
 * 极简会话记忆：按用户 ID 存最近几轮对话。
 *
 * 只存 user / assistant 的纯文本，不存 tool_calls 中间态——
 * 否则下一轮把残缺的 tool_call 发回模型会直接报 400。
 * 生产环境请换成 Redis / SQLite。
 */
const MAX_TURNS = 6; // 保留最近 6 轮（12 条消息）
const sessions = new Map<string, ChatMessage[]>();

export function getHistory(userId: string): ChatMessage[] {
  return sessions.get(userId) ?? [];
}

export function appendTurn(userId: string, userText: string, assistantText: string): void {
  const history = sessions.get(userId) ?? [];
  history.push({ role: 'user', content: userText });
  history.push({ role: 'assistant', content: assistantText });

  const maxMessages = MAX_TURNS * 2;
  if (history.length > maxMessages) {
    history.splice(0, history.length - maxMessages);
  }
  sessions.set(userId, history);
}

export function resetSession(userId: string): void {
  sessions.delete(userId);
}
