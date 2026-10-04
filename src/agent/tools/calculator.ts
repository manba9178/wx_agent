import { all, create } from 'mathjs';
import type { Tool } from './types.js';

const math = create(all, {});

/** 白名单作用域：只暴露这几个函数，连 import / evaluate 都碰不到 */
const SAFE_SCOPE: Record<string, unknown> = {
  sqrt: math.sqrt,
  cbrt: math.cbrt,
  abs: math.abs,
  sin: math.sin,
  cos: math.cos,
  tan: math.tan,
  asin: math.asin,
  acos: math.acos,
  atan: math.atan,
  log: math.log,
  log10: math.log10,
  log2: math.log2,
  exp: math.exp,
  pow: math.pow,
  round: math.round,
  floor: math.floor,
  ceil: math.ceil,
  min: math.min,
  max: math.max,
  factorial: math.factorial,
  mod: math.mod,
  pi: math.pi,
  e: math.e,
};

/** 只允许数字、运算符和字母（函数名），其他一律拒绝 */
const SAFE_EXPRESSION = /^[\d\s+\-*/%^().,a-zA-Z]+$/;
const MAX_LENGTH = 200;

/**
 * 算数工具：交给 mathjs 求值，并限定在白名单作用域内执行。
 * 为什么要做成工具而不是让 LLM 心算？—— 大数乘除、开方、百分比模型很容易算错。
 */
export const calculatorTool: Tool = {
  name: 'calculate',
  description:
    '进行数学计算，支持加减乘除、幂(^)、取模(%)、括号以及常见函数（sqrt/abs/sin/cos/log/round/pow 等）。' +
    '任何涉及数字运算的问题都必须调用本工具，不要自己心算。',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: '数学表达式，例如 "(12+34)*5"、"2^10"、"sqrt(144)"、"1234*5678"',
      },
    },
    required: ['expression'],
  },

  async run(args) {
    const expression = String(args.expression ?? '').trim();

    if (!expression) return '表达式为空。';
    if (expression.length > MAX_LENGTH) return `表达式过长（上限 ${MAX_LENGTH} 个字符）。`;
    if (!SAFE_EXPRESSION.test(expression)) {
      return '表达式包含不支持的字符，只支持数字、运算符和常见数学函数。';
    }

    try {
      const result = math
        .parse(expression)
        .evaluate(new Map(Object.entries(SAFE_SCOPE)) as never);

      // 数字走 toPrecision 避免出现 7.006751e+6 这种科学计数法
      const formatted =
        typeof result === 'number' && Number.isFinite(result)
          ? String(Number(result.toPrecision(12)))
          : math.format(result, { precision: 12 });

      return `${expression} = ${formatted}`;
    } catch (error) {
      return `计算失败：${(error as Error).message}`;
    }
  },
};
