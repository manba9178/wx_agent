export interface Tool {
  /** 工具名，LLM 用它来调用 */
  name: string;
  /** 描述写清楚「什么时候用」，直接影响 LLM 是否会调用 */
  description: string;
  /** JSON Schema 形式的参数定义 */
  parameters: Record<string, unknown>;
  /** 真正执行，返回给 LLM 的纯文本结果 */
  run(args: Record<string, unknown>): Promise<string>;
}
