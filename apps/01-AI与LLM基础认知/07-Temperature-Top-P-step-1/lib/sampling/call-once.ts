/**
 * 职责：向模型发一次非流式请求，把 temperature / top_p 作为参数暴露出去。
 * 数据流：{ llm, prompt, params, index } → chat.completions.create → 剥思考标记 → SingleRun。
 * 为什么单独成文件：整个 Demo 只有这一处真的碰 SDK。
 *   flow 层只管「跑几次、怎么判定」，换协议或换 SDK 时也只需要改这一个文件。
 *
 * 日志（§5.3.16）：callOnce 是整个 Demo 唯一的 LLM 触点；
 *   每次 call 前打 llm.request 记录这次到底发了什么参数（教学结论归因靠它），
 *   call 后打 llm.response 完整打回 SDK 自带字段（id / choices / usage）便于追行为。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import { logger } from "../logger.js";
import { MAX_TOKENS, SYSTEM_PROMPT } from "./presets.js";
import type { SamplingParams, SingleRun } from "./sampling-types.js";

/**
 * 剥掉 …。
 * 为什么必须剥：有些模型会把思考过程一起吐出来，而思考过程几乎每次都不一样。
 * 不剥的话，两次「店名其实一模一样」的结果会被判成分叉，教学结论就反了。
 */
export function visibleText(raw: string): string {
  return raw.replace(/[\s\S]*?<\/think>/gi, "").trim();
}

export async function callOnce(
  llm: Llm,
  prompt: string,
  params: SamplingParams,
  index: number,
): Promise<SingleRun> {
  const startedAt = performance.now();
  // ① 两个旋钮都显式传：本条的教学点就是「这次到底发了什么参数」，
  //    留任何一个走 SDK 默认值，页面上就说不清对照组差在哪。
  //    stream 用 false 字面量（不是 boolean）让 SDK 返回类型窄化为非流式 response。
  const requestShape = {
    model: llm.modelA,
    messages: [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { role: "user" as const, content: prompt },
    ],
    temperature: params.temperature,
    top_p: params.topP,
    max_tokens: MAX_TOKENS,
    stream: false as const,
  };
  logger.info(
    "llm.request",
    "→ openai.chat.completions.create",
    `第 ${index} 次采样发起请求；记录 temperature / top_p 便于回头对照页面卡片归因（哪一档参数产生了哪种说法）`,
    {
      run: index,
      provider: llm.provider,
      model: llm.modelA,
      messagesCount: requestShape.messages.length,
      temperature: params.temperature,
      topP: params.topP,
      maxTokens: MAX_TOKENS,
      promptPreview: prompt.slice(0, 60),
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(requestShape, null, 2)});`,
    },
  );
  try {
    const completion = await llm.openai.chat.completions.create(requestShape);
    logger.info(
      "llm.response",
      "← got response",
      "完整打响应便于核对 SDK 自带字段（id / choices[0].finish_reason / usage），失败 / 截断 / 限流都能在这行回追",
      { run: index, ...completion },
    );

    // ② 先剥思考标记再回退到原文：剥完为空说明模型这次只输出了思考块，
    //    此时展示原文比展示空字符串更有信息量。
    const raw = completion.choices[0]?.message.content?.trim() ?? "";
    const visible = visibleText(raw);
    return {
      index,
      text: visible || raw || "(空回复)",
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (error: unknown) {
    // ③ 单次失败不上抛：一组里第 2 次挂掉，第 1 次的结果仍然要能看见。
    //    真正需要变成 HTTP 错误码的情形由 route 层的 writeUpstreamError 处理。
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      "llm.error",
      "callOnce threw",
      `第 ${index} 次采样抛异常；记 message 便于排错（网络 / 5xx / 4xx），callOnce 不上抛所以本组其余跑次不受影响`,
      { run: index, temperature: params.temperature, topP: params.topP, err: message },
    );
    return {
      index,
      text: "",
      durationMs: Math.round(performance.now() - startedAt),
      error: message,
    };
  }
}
