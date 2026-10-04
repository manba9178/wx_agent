import express, { type Router } from 'express';
import { XMLParser } from 'fast-xml-parser';
import { config } from '../config.js';
import { WecomCrypto } from './crypto.js';
import type { IncomingMessage, MessageHandler } from './types.js';

const parser = new XMLParser({ ignoreAttributes: false });

/**
 * 企业微信「API 接收消息」回调路由。
 *
 * GET  /wecom/callback  用于配置 URL 时的验证（解密 echostr 原样返回）
 * POST /wecom/callback  接收用户消息（解密 -> 立即 200 -> 异步交给 Agent 处理）
 *
 * 注意：企业微信要求 5 秒内响应，LLM 不可能这么快，
 * 因此这里必须"先响应空串、再异步主动发消息"，不能走被动回复 XML。
 */
export function createWecomRouter(handleMessage: MessageHandler): Router {
  const router = express.Router();
  const crypto = new WecomCrypto(
    config.wecom.token,
    config.wecom.encodingAESKey,
    config.wecom.corpId,
  );

  router.get('/callback', (req, res) => {
    const { msg_signature, timestamp, nonce, echostr } = req.query as Record<string, string>;

    if (!crypto.verify(msg_signature, timestamp, nonce, echostr)) {
      console.warn('[wecom] URL 验证签名不通过，请检查 Token 是否填对');
      return res.status(401).send('invalid signature');
    }

    try {
      return res.type('text/plain').send(crypto.decrypt(echostr));
    } catch (error) {
      console.error('[wecom] echostr 解密失败:', error);
      return res.status(500).send('decrypt failed');
    }
  });

  router.post('/callback', (req, res) => {
    const { msg_signature, timestamp, nonce } = req.query as Record<string, string>;
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');

    let encrypt = '';
    try {
      encrypt = parser.parse(rawBody)?.xml?.Encrypt ?? '';
    } catch {
      encrypt = '';
    }

    if (!encrypt) {
      // 企业微信偶尔会推空包/心跳，直接吞掉
      return res.send('');
    }

    if (!crypto.verify(msg_signature, timestamp, nonce, encrypt)) {
      console.warn('[wecom] 消息签名校验失败');
      return res.status(401).send('');
    }

    let message: IncomingMessage;
    try {
      const xml = parser.parse(crypto.decrypt(encrypt))?.xml ?? {};
      message = normalize(xml);
    } catch (error) {
      console.error('[wecom] 消息解密失败:', error);
      return res.send('');
    }

    // 关键：先应答企业微信，避免超时重试
    res.send('');

    void handleMessage(message).catch((error) => {
      console.error('[wecom] 处理消息出错:', error);
    });

    return undefined;
  });

  return router;
}

function normalize(xml: Record<string, unknown>): IncomingMessage {
  const str = (key: string): string => {
    const value = xml[key];
    return value === undefined || value === null ? '' : String(value);
  };

  return {
    msgType: str('MsgType'),
    fromUser: str('FromUserName'),
    toUser: str('ToUserName'),
    chatId: str('ChatId'),
    content: str('Content'),
    msgId: str('MsgId'),
    agentId: str('AgentID'),
    event: str('Event') || undefined,
  };
}
