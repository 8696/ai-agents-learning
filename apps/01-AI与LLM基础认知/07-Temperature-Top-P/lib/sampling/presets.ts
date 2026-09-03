/**
 * 职责：本条教学用的采样档位与默认 prompt（温度梯子 / Top-P 梯子 / 跑几次 / system prompt）。
 * 数据流：常量 → routes 组装请求 & /health 回给页面 → 页面卡片标题直接显示这些档位。
 * 为什么单独成文件：档位是「教学参数」而不是实现细节。想把温度梯子从 0/0.7/1.2 改成
 *   0/0.5/1.5 时，应该只改这一个文件，而不是去 flow 的循环里翻数字；
 *   /health 把梯子回给前端也是为了同一件事：页面不写死档位，两边不会讲不一样的话。
 */

/** 默认 prompt 故意选「答案很短、能一眼比对是否逐字相同」的任务：起名，四个字以内。 */
export const DEFAULT_PROMPT =
  "给一间开在海边的咖啡店起一个店名。只回店名四个字以内，不要解释。";

/** 压掉思考过程与解释，让回答本身成为唯一变量——否则比对的是「解释怎么写」而不是采样差异。 */
export const SYSTEM_PROMPT = "只输出最终答案本身。不要分析过程，不要 XML 标签。";

/** 温度梯子：0 = 贪心解码、0.7 = 通用折中、1.2 = 创意档。扫这一轴时 Top-P 固定。 */
export const TEMPERATURE_LADDER: readonly number[] = [0, 0.7, 1.2];

/** Top-P 梯子：1 = 不过滤、0.9 = 常用、0.3 = 只留最自信的那一小撮候选。 */
export const TOP_P_LADDER: readonly number[] = [1, 0.9, 0.3];

/** 扫温度时固定的 Top-P。一次只动一个旋钮，才归因得了「是谁造成的变化」。 */
export const FIXED_TOP_P = 1;

/**
 * 扫 Top-P 时默认的温度。用 1 而不是 0：
 * T=0 是贪心解码（永远挑概率最高那个 token），此时候选集大小对结果没有影响，
 * Top-P 三档会得到一模一样的输出——那正是 top-p 页要让人亲手验证的对照，所以它是可选项而不是默认值。
 */
export const DEFAULT_SWEEP_TEMPERATURE = 1;

/** 每档跑几次。2 次够看出「相同 / 分叉」，也把一次点击的调用量压在 6 次。 */
export const DEFAULT_RUNS_PER_GROUP = 2;

/** 重复稳定性页默认次数：5 次才谈得上「去重后有几种说法」。 */
export const DEFAULT_REPEAT_RUNS = 5;

/** 单次回复的 token 上限。答案本来就短，给 256 是为了给夹带思考过程的模型留余量。 */
export const MAX_TOKENS = 256;
