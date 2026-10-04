import { runAgent } from '../agent/agent.js';
import { config } from '../config.js';

/**
 * 验收演示脚本：把导师要求的三条任务一次性跑完。
 *   npm run demo                  # 跑默认的三条
 *   npm run demo -- "任意问题"     # 跑自定义问题
 */
const DEFAULT_QUERIES = [
  '今天北京天气怎么样？',
  '(1234*5678)+99 等于多少？',
  '帮我查一下我的 Google Scholar 信息',
];

async function main(): Promise<void> {
  const queries = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const list = queries.length ? queries : DEFAULT_QUERIES;

  console.log('==========================================');
  console.log(` 验收演示 · 模型 ${config.llm.model}`);
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
