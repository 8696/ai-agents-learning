/**
 * 职责：向模型发一次非流式请求，把 temperature / top_p 作为参数暴露出去。
 * 数据流：{ llm, prompt, params, index } → chat.completions.create → 剥思考标记 → SingleRun。
 * 为什么单独成文件：整个 Demo 只有这一处真的碰 SDK。
 *   flow 层只管「跑几次、怎么判定」，换协议或换 SDK 时也只需要改这一个文件。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import { MAX_TOKENS, SYSTEM_PROMPT } from "./presets.js";
import type { SamplingParams, SingleRun } from "./sampling-types.js";

/**
 * 剥掉 <think>…</think>。
 * 为什么必须剥：有些模型会把思考过程一起吐出来，而思考过程几乎每次都不一样。
 * 不剥的话，两次「店名其实一模一样」的结果会被判成分叉，教学结论就反了。
 */
export function visibleText(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export async function callOnce(
  llm: Llm,
  prompt: string,
  params: SamplingParams,
  index: number,
): Promise<SingleRun> {
  const startedAt = performance.now();
  try {
    // ① 两个旋钮都显式传：本条的教学点就是「这次到底发了什么参数」，
    //    留任何一个走 SDK 默认值，页面上就说不清对照组差在哪。
    const completion = await llm.openai.chat.completions.create({
      model: llm.modelA,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: params.temperature,
      top_p: params.topP,
      max_tokens: MAX_TOKENS,
      stream: false,
    });

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
    return {
      index,
      text: "",
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
