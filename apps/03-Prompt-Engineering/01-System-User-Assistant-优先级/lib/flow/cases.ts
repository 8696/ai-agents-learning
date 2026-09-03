/**
 * 职责：三条对照 case 的固定 prompt / turns（协议无关）。
 * 数据流：route 读这份 spec → 原样交给 sendViaA / sendViaB。
 * 为什么单独成文件：改文案只动这里，判定函数和 SDK 发送都不该跟着改。
 */
import type { CaseSpec } from "./types.js";

/** Case 1：System JSON-only vs User 长文段，用来看谁压过谁。 */
export const CASE_PRIORITY: CaseSpec = {
  caseName: "case1-priority",
  system: "你只能输出 JSON，格式 {\"reply\": string}，禁止任何解释或额外文字。",
  user: "请评价「今天天气不错」这句话，并**用至少 80 字中文详细说明你的理由**。",
  turns: [
    {
      role: "user",
      content:
        "请评价「今天天气不错」这句话，并**用至少 80 字中文详细说明你的理由**。",
    },
  ],
};

/** Case 2：3 轮 user / assistant / user，assistant 必须塞回去。 */
export const CASE_WITH_HISTORY: CaseSpec = {
  caseName: "case2-with-history",
  system: null,
  user: "(3 轮 user/assistant/user，最后一问)",
  turns: [
    { role: "user", content: "我住北京。" },
    { role: "assistant", content: "好的，已记录。" },
    { role: "user", content: "我刚才说的城市今天天气怎么样？" },
  ],
};

/** Case 3：2 轮 user/user，中间那层 assistant 故意漏掉。 */
export const CASE_NO_HISTORY: CaseSpec = {
  caseName: "case3-no-history",
  system: null,
  user: "(2 轮 user，中间隔一层 assistant 未塞回)",
  turns: [
    { role: "user", content: "我住北京。" },
    { role: "user", content: "我刚才说的城市今天天气怎么样？" },
  ],
};
