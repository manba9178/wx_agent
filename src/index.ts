import express from 'express';
import { runAgent } from './agent/agent.js';
import { assertConfig, config } from './config.js';
import { sendText } from './wecom/api.js';
import { createWecomRouter } from './wecom/callback.js';
import { getCurrentTunnelUrl } from './wecom/tunnel.js';

const app = express();

// 企业微信回调是 XML，必须拿原始 Buffer，不能用 express.json()
app.use(express.raw({ type: () => true, limit: '2mb' }));

app.get('/', (_req, res) => {
  res.type('text/plain').send('wx-agent is running 🚀');
});

app.use(
  '/wecom',
  createWecomRouter(async (message) => {
    // 只处理文本消息，其它类型给个提示
    if (message.msgType !== 'text' || !message.content.trim()) {
      console.log(`[wecom] 忽略非文本消息: ${message.msgType}`);
      if (message.msgType !== 'event') {
        await sendText(message.fromUser, '目前我只认识文字消息，发文字给我吧～', message.chatId);
      }
      return;
    }

    const tunnelUrl = getCurrentTunnelUrl();
    console.log(`[wecom] <- ${message.fromUser}${message.chatId ? `@${message.chatId}` : ''}: ${message.content}`);
    console.log(`[tunnel] 当前对外 URL: ${tunnelUrl ?? '(未读取到 tunnel.log)'}`);

    // 立即 ack：让用户知道 Agent 在跑，避免误以为 URL 变了
    await sendText(message.fromUser, '🤔 正在处理…', message.chatId).catch((err) => {
      console.warn('[wecom] 发送 ack 失败:', err);
    });

    const reply = await runAgent(message.fromUser, message.content);
    console.log(`[wecom] -> ${message.fromUser}: ${reply.slice(0, 80)}...`);
    await sendText(message.fromUser, reply, message.chatId);
  }),
);

assertConfig();

app.listen(config.port, () => {
  console.log(`✅ wx-agent 已启动: http://localhost:${config.port}`);
  console.log(`   企业微信回调地址请填: https://<你的公网域名>/wecom/callback`);
});