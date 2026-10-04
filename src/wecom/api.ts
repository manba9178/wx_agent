import { config } from '../config.js';

interface TokenCache {
  value: string;
  expiresAt: number;
}

let tokenCache: TokenCache = { value: '', expiresAt: 0 };

export async function getAccessToken(): Promise<string> {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) return tokenCache.value;

  const url =
    'https://qyapi.weixin.qq.com/cgi-bin/gettoken' +
    `?corpid=${encodeURIComponent(config.wecom.corpId)}` +
    `&corpsecret=${encodeURIComponent(config.wecom.secret)}`;

  const data = (await (await fetch(url)).json()) as WecomResponse & {
    access_token: string;
    expires_in: number;
  };

  if (data.errcode !== 0) {
    throw new Error(`获取 access_token 失败: ${data.errcode} ${data.errmsg}`);
  }

  tokenCache = {
    value: data.access_token,
    // 官方 7200s，提前 120s 过期，避免边界失败
    expiresAt: Date.now() + (data.expires_in - 120) * 1000,
  };
  return tokenCache.value;
}

interface WecomResponse {
  errcode: number;
  errmsg: string;
}

interface SendPayload {
  msgtype: 'text';
  agentid: number;
  text: { content: string };
  safe: 0;
  touser?: string;
  chatid?: string;
}

/**
 * 发送文本消息。
 * - 私聊：touser = 成员 UserID
 * - 群聊：chatid = 群 ID（需要应用已加入该群聊），失败自动回退成私聊
 */
export async function sendText(toUser: string, content: string, chatId?: string): Promise<void> {
  const token = await getAccessToken();

  const post = async (payload: SendPayload): Promise<WecomResponse> => {
    const res = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return (await res.json()) as WecomResponse;
  };

  // 企业微信单条文本上限 2048 字节，超长直接截断避免整体失败
  const safeContent = truncate(content, 1800);

  const base: SendPayload = {
    msgtype: 'text',
    agentid: config.wecom.agentId,
    text: { content: safeContent },
    safe: 0,
  };

  if (chatId) {
    const inGroup = await post({ ...base, chatid: chatId });
    if (inGroup.errcode === 0) return;
    console.warn(`[wecom] 群聊发送失败(${inGroup.errcode} ${inGroup.errmsg})，回退为私聊`);
  }

  const direct = await post({ ...base, touser: toUser });
  if (direct.errcode !== 0) {
    throw new Error(`发送消息失败: ${direct.errcode} ${direct.errmsg}`);
  }
}

function truncate(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  let out = text;
  while (Buffer.byteLength(out, 'utf8') > maxBytes - 3 && out.length > 0) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}
