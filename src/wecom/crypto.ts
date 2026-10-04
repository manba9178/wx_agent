import crypto from 'node:crypto';

/**
 * 企业微信回调消息加解密（对应官方 WXBizMsgCrypt，Node 实现）。
 *
 * 规则：
 * 1. 签名 = sha1(sort(token, timestamp, nonce, encrypt).join(''))
 * 2. AES-256-CBC，key = base64decode(EncodingAESKey + '=')，iv = key[:16]
 * 3. 明文结构：random(16B) + msgLen(4B, 大端) + msg + receiveId
 * 4. 填充使用 PKCS#7，块大小 32 字节
 */

const BLOCK_SIZE = 32;

export function computeSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string,
): string {
  return crypto
    .createHash('sha1')
    .update([token, timestamp, nonce, encrypt].sort().join(''), 'utf8')
    .digest('hex');
}

export class WecomCrypto {
  private readonly key: Buffer;
  private readonly iv: Buffer;

  constructor(
    private readonly token: string,
    private readonly encodingAESKey: string,
    private readonly corpId: string,
  ) {
    this.key = Buffer.from(`${encodingAESKey}=`, 'base64');
    this.iv = this.key.subarray(0, 16);
  }

  /** 校验回调签名 */
  verify(msgSignature: string, timestamp: string, nonce: string, encrypt: string): boolean {
    const expected = computeSignature(this.token, timestamp, nonce, encrypt);
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(msgSignature ?? '', 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  /** 解密回调内容，返回明文（XML 或 echostr） */
  decrypt(encrypted: string): string {
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, this.iv);
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ]);

    const unpadded = pkcs7Unpad(decrypted);
    const content = unpadded.subarray(16);
    const msgLen = content.readUInt32BE(0);
    const msg = content.subarray(4, 4 + msgLen).toString('utf8');
    const receiveId = content.subarray(4 + msgLen).toString('utf8');

    if (this.corpId && receiveId !== this.corpId) {
      console.warn(`[wecom] receiveId(${receiveId}) 与 corpid(${this.corpId}) 不一致，请检查配置`);
    }
    return msg;
  }

  /** 加密内容（被动回复时使用） */
  encrypt(msg: string): string {
    const msgBuf = Buffer.from(msg, 'utf8');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(msgBuf.length, 0);

    const raw = Buffer.concat([
      crypto.randomBytes(16),
      lenBuf,
      msgBuf,
      Buffer.from(this.corpId, 'utf8'),
    ]);

    const cipher = crypto.createCipheriv('aes-256-cbc', this.key, this.iv);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(pkcs7Pad(raw)), cipher.final()]).toString('base64');
  }
}

function pkcs7Unpad(buf: Buffer): Buffer {
  if (buf.length === 0) return buf;
  const pad = buf[buf.length - 1];
  if (pad < 1 || pad > BLOCK_SIZE) return buf;
  return buf.subarray(0, buf.length - pad);
}

function pkcs7Pad(buf: Buffer): Buffer {
  const pad = BLOCK_SIZE - (buf.length % BLOCK_SIZE) || BLOCK_SIZE;
  return Buffer.concat([buf, Buffer.alloc(pad, pad)]);
}
