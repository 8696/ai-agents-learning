/**
 * 职责：故意发一份违反 OpenAI strict 白名单的 schema，看 API 入口拒不拒。
 * 数据流：BAD_STRICT_SCHEMA → create → 期望抛错（真 400）或 unexpectedSuccess（软约束网关）。
 * 为什么单独成文件：这一刀测的不是模型守约，是「这家网关有没有真做 token-mask」。
 *   和诱导 enum 违规不是一回事，混进 structured 会让人以为是 prompt 写坏了。
 */
import type { Llm } from "../../../../llm.js";
import { BAD_STRICT_SCHEMA } from "../schema/intent.js";

export type StrictRejectedOk = {
  mode: "json_schema_strict";
  unexpectedSuccess: true;
  raw: string;
};

export type StrictRejectedErr = {
  mode: "json_schema_strict";
  rejected: true;
};

/**
 * 成功走到 200 才怪：bad schema + strict 应该被 API 400。
 * 部分国内网关会 silent accept —— 页面要把 unexpectedSuccess 标成诊断结果，不是 bug。
 */
export async function runStrictRejected(llm: Llm): Promise<StrictRejectedOk> {
  const res = await llm.openai.chat.completions.create({
    model: llm.modelA,
    response_format: {
      type: "json_schema",
      json_schema: { name: "Bad", schema: BAD_STRICT_SCHEMA, strict: true },
    },
    messages: [{ role: "user", content: "随便返回点东西" }],
  });

  return {
    mode: "json_schema_strict",
    unexpectedSuccess: true,
    raw: res.choices[0]?.message?.content ?? "",
  };
}
