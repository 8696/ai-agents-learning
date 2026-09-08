/**
 * 职责：故意发一份违反 OpenAI strict 白名单的 schema，看 API 入口拒不拒。
 * 数据流：BAD_STRICT_SCHEMA → create → 期望抛错（真 400）或 unexpectedSuccess（软约束网关）。
 * 为什么单独成文件：这一刀测的不是模型守约，是「这家网关有没有真做 token-mask」。
 *   和诱导 enum 违规不是一回事，混进 structured 会让人以为是 prompt 写坏了。
 *
 * 日志（§5.3.16）：调用函数 五件套（runStrictRejected 封装层），调用模型 五件套（出网层）。
 *   unexpectedSuccess 是 warn（业务语义——网关未守约）；正常 400 是上游抛错由 route catch 处理。
 */
import { performance } from "node:perf_hooks";
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
  const t0 = performance.now();
  const tFuncStart = Date.now();
  const request = {
    model: llm.modelA,
    response_format: {
      type: "json_schema" as const,
      json_schema: { name: "Bad", schema: BAD_STRICT_SCHEMA, strict: true as const },
    },
    messages: [{ role: "user" as const, content: "随便返回点东西" }],
  };

  logger.info(
    "│ 坏 schema-runStrictRejected",
    "调用函数开始：runStrictRejected",
    "为什么打：route 只认这一层返回的 StrictRejectedOk | StrictRejectedErr；里面那次才是出网（看「调用模型开始：协议A-对话补全」）。当前：bad schema + strict 应该被 API 入口 400。",
    {
      入参: { model: llm.modelA },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型开始：协议A 对话补全",
    "为什么打：这一刀测的不是模型守约，是网关有没有真做 token-mask；缺 additionalProperties:false + 含 anyOf 都该在 API 入口 400。当前：即将发出坏 schema + strict 请求。",
    {
      入参: {
        model: request.model,
        response_format: request.response_format,
        badSchemaFields: Object.keys(BAD_STRICT_SCHEMA.properties ?? {}),
      },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
    },
  );

  const res = await llm.openai.chat.completions.create(request as never);
  logger.warn(
    "││ 调用模型-协议A 对话补全",
    "调用模型结束：协议A 对话补全（unexpectedSuccess）",
    "为什么打：bad schema + strict 居然 200 → 网关是软约束而非 token-level mask；记录 unexpectedSuccess 便于在页面标成「诊断结果：网关未守约」而非业务 bug。warn 是「业务语义——预期外但能走通」的等级。",
    {
      返回值: { id: res.id, model: res.model, finishReason: res.choices?.[0]?.finish_reason, rawPreview: (res.choices?.[0]?.message?.content ?? "").slice(0, 400) },
      耗时ms: Date.now() - tModelStart,
    },
  );

  const result: StrictRejectedOk = {
    mode: "json_schema_strict",
    unexpectedSuccess: true,
    raw: res.choices[0]?.message?.content ?? "",
  };
  logger.info(
    "│ 坏 schema-runStrictRejected",
    "调用函数结束：runStrictRejected",
    "为什么打：route 要把 StrictRejectedOk 写进 ctx.body 交给页面；记 unexpectedSuccess 状态便于前端标成「诊断结果：网关未守约」。当前：真 200 unexpectedSuccess。",
    {
      返回值: { mode: result.mode, unexpectedSuccess: true, rawLen: result.raw.length },
      耗时ms: Date.now() - tFuncStart,
    },
  );
  void t0;
  return result;
}