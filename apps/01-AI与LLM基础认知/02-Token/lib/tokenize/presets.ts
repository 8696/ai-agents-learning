/**
 * 职责：中英对照用的固定样本。页面不写死这两句，改这里 /health 会一起变。
 * 数据流：被 encode-text / /health / /api/compare 读取。
 * 为什么单独成文件：对照句一旦散进 route 和页面，迟早对不齐。
 */
export const ENGLISH = "Hello, I like to eat apples.";
export const CHINESE = "你好，我喜欢吃苹果。";

export const VOCAB_LABEL =
  "cl100k（OpenAI GPT-4 常用；MiniMax 词表可能不同，用来看量级）";
