export interface IncomingMessage {
  /** text / image / event ... */
  msgType: string;
  /** 发送者成员 UserID */
  fromUser: string;
  /** 接收方（应用的回调里是 CorpID） */
  toUser: string;
  /** 群聊消息才会有：群 ID */
  chatId: string;
  /** 文本内容 */
  content: string;
  msgId: string;
  agentId: string;
  /** 事件类型（MsgType=event 时） */
  event?: string;
}

export type MessageHandler = (message: IncomingMessage) => Promise<void>;
