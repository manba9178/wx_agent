import readline from 'node:readline';
import { runAgent } from '../agent/agent.js';
import { assertConfig, config } from '../config.js';

/**
 * 本地调试入口：不用配企业微信，先在终端里把 Agent 跑通。
 *   npm run chat
 */
async function main(): Promise<void> {
  assertConfig();
  console.log('====================================');
  console.log(' 本地调试模式（不经过企业微信）');
  console.log(` 模型: ${config.llm.model} @ ${config.llm.baseUrl}`);
  console.log(' 试试：今天北京天气怎么样 / (1234*5678)+99 等于多少 / 查一下我的 Google Scholar');
  console.log(' 提示：现在是通用工具架构，agent 会自己读 skills/ 技能文档再组合工具完成任务');
  console.log(' 输入 q 退出，输入 /reset 清空上下文');
  console.log('====================================\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (): void => {
    rl.question('你 > ', (input) => {
      const text = input.trim();
      if (text === 'q' || text === 'exit') {
        rl.close();
        return;
      }
      void (async () => {
        try {
          const reply = await runAgent('local-debug-user', text);
          console.log(`\n助手 > ${reply}\n`);
        } catch (error) {
          console.error(`\n[错误] ${(error as Error).message}\n`);
        }
        ask();
      })();
    });
  };

  ask();
}

void main();
