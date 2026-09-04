/**
 * 职责：故意发一份违反 OpenAI strict 白名单的 schema，看 API 入口拒不拒。
 * 数据流：BAD_STRICT_SCHEMA → create → 期望抛错（真 400）或 unexpectedSuccess（软约束网关）。
 * 为什么单独成文件：这一刀测的不是模型守约，是「这家网关有没有真做 token-mask」。
 *   和诱导 enum 违规不是一回事，混进 structured 会让人以为是 prompt 写坏了。
 */
import type { Llm } from "../../../../llm.js";
import { BAD_STRICT_SCHEMA } from "../schema/intent.js";
import { logger } from "../logger.js";

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
  const request = {
    model: llm.modelA,
    response_format: {
      type: "json_schema" as const,
      json_schema: { name: "Bad", schema: BAD_STRICT_SCHEMA, strict: true as const },
    },
    messages: [{ role: "user" as const, content: "随便返回点东西" }],
  };
  logger.info(
    "llm.request.strict_rejected",
    "→ 协议 A 故意发坏 schema 看 strict 闸",
    "这一刀测的不是模型守约，是网关有没有真做 token-mask：缺 additionalProperties:false + 含 anyOf 都该在 API 入口 400；记 strict / schema 关键字段便于核对请求",
    {
      model: request.model,
      response_format: request.response_format,
      badSchemaFields: Object.keys(BAD_STRICT_SCHEMA.properties ?? {}),
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
    },
  );
  const res = await llm.openai.chat.completions.create(request as never);

  logger.warn(
    "llm.response.strict_rejected",
    "← 协议 A 居然 200，strict 闸没真做 token-mask",
    "bad schema + strict 还能 200 → 网关是软约束而非 token-level mask；记录 unexpectedSuccess 便于在页面标成「诊断结果：网关未守约」而非业务 bug",
    res,
  );

  return {
    mode: "json_schema_strict",
    unexpectedSuccess: true,
    raw: res.choices[0]?.message?.content ?? "",
  };
}
