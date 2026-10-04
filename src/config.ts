import 'dotenv/config';

function env(name: string, fallback = ''): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

export const config = {
  port: Number(env('WECOM_PORT', '3000')),

  wecom: {
    corpId: env('WECOM_CORP_ID'),
    agentId: Number(env('WECOM_AGENT_ID', '0')),
    secret: env('WECOM_SECRET'),
    token: env('WECOM_CALLBACK_TOKEN'),
    encodingAESKey: env('WECOM_ENCODING_AES_KEY'),
  },

  llm: {
    baseUrl: env('LLM_BASE_URL', 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
    apiKey: env('LLM_API_KEY'),
    model: env('LLM_MODEL', 'deepseek-chat'),
  },

  scholar: {
    userId: env('SCHOLAR_USER_ID'),
    name: env('SCHOLAR_NAME'),
    serpApiKey: env('SERPAPI_KEY'),
  },

  defaults: {
    city: env('DEFAULT_CITY', '北京'),
  },
} as const;

/** 启动时做一次体检，把明显缺失的配置直接报出来，避免联调时抓瞎 */
export function assertConfig(): void {
  const problems: string[] = [];
  const { wecom, llm } = config;

  if (!wecom.corpId) problems.push('WECOM_CORP_ID 未配置');
  if (!wecom.agentId) problems.push('WECOM_AGENT_ID 未配置');
  if (!wecom.secret) problems.push('WECOM_SECRET 未配置');
  if (!wecom.token) problems.push('WECOM_CALLBACK_TOKEN 未配置');
  if (!wecom.encodingAESKey) problems.push('WECOM_ENCODING_AES_KEY 未配置');
  if (wecom.encodingAESKey && wecom.encodingAESKey.length !== 43) {
    problems.push(`WECOM_ENCODING_AES_KEY 长度应为 43，当前 ${wecom.encodingAESKey.length}`);
  }
  if (!llm.apiKey) problems.push('LLM_API_KEY 未配置');

  if (problems.length) {
    console.warn('\n[config] 以下配置缺失或不合法，企业微信联调会失败：');
    for (const p of problems) console.warn(`  - ${p}`);
    console.warn('  （本地 `npm run chat` 调试只需要 LLM_API_KEY）\n');
  }
}
