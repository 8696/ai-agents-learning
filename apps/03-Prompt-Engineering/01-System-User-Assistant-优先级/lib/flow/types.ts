/**
 * 职责：本条对照 Demo 的协议无关形状（turns / 判定 / 两侧结果）。
 * 数据流：protocol-a|b 产出 CallResult → flow 判定 → CaseResponse 给浏览器。
 * 为什么单独成文件：send 与 judge 都要引用同一份形状，放进任一协议目录会把另一边拖进来。
 */

export type Role = "system" | "user" | "assistant";
export type Turn = { role: Exclude<Role, "system">; content: string };

/** Case 1：听没听 System；Case 2/3：记得还是失忆。PARTIAL 是 Case 1 的妥协 / Case 3 的「从 user 文本里读到了北京」。 */
export type Verdict = "SYSTEM_WIN" | "USER_WIN" | "REMEMBERED" | "FORGOT" | "PARTIAL";

export type CallResult = {
  text: string;
  usage: { input: number; output: number };
  durationMs: number;
};

export type SideResult = {
  protocol: "A" | "B";
  text: string;
  /** 剥掉 thinking 块后的正文：协议 A 常和 text 不同，协议 B 通常相同。 */
  cleanedText: string;
  usage: { input: number; output: number };
  durationMs: number;
  verdict: Verdict;
  verdictLabel: string;
  error?: string;
};

export type CaseSpec = {
  caseName: string;
  system: string | null;
  user: string;
  turns: Turn[];
};

export type CaseResponse = CaseSpec & {
  a: SideResult;
  b: SideResult;
};
