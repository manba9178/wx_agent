import { runAgent } from '../agent/agent.js';
import { config } from '../config.js';

/**
 * 示例脚本：批量跑几个示例问题，观察 Agent 的工具调用过程。
 *   npm run demo                  # 跑默认的示例
 *   npm run demo -- "任意问题"     # 跑自定义问题
 */
const DEFAULT_QUERIES = [
  '今天北京天气怎么样？',
  '(1234*5678)+99 等于多少？',
  '查一下戴玮辰的 Google Scholar 引用和代表作',
];

async function main(): Promise<void> {
  const queries = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const list = queries.length ? queries : DEFAULT_QUERIES;

  console.log('==========================================');
  console.log(` 示例 · 模型 ${config.llm.model}`);
  console.log('==========================================\n');

  for (const [index, query] of list.entries()) {
    console.log(`【${index + 1}】用户: ${query}`);
    const start = Date.now();
    try {
      const reply = await runAgent(`demo-user-${index}`, query);
      console.log(`【${index + 1}】助手: ${reply}`);
    } catch (error) {
      console.log(`【${index + 1}】❌ 出错: ${(error as Error).message}`);
    }
    console.log(`      (耗时 ${((Date.now() - start) / 1000).toFixed(1)}s)\n`);
  }

  console.log('============== 演示结束 ==============');
}

void main();
