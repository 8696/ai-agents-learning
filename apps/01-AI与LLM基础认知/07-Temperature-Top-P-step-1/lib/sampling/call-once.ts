/**
 * 职责：向模型发一次非流式请求，把 temperature / top_p 作为参数暴露出去。
 * 数据流：{ llm, prompt, params, index } → chat.completions.create → 剥思考标记 → SingleRun。
 * 为什么单独成文件：整个 Demo 只有这一处真的碰 SDK。
 *   flow 层只管「跑几次、怎么判定」，换协议或换 SDK 时也只需要改这一个文件。
 *
 * 日志（§5.3.16）：callOnce 是整个 Demo 唯一的 LLM 触点；
 *   调用函数 五件套（callOnce 封装层），调用模型 五件套（出网层，含 __code + 字段释义）；
 *   单次失败不上抛——catch 里打 error + （失败）说明本组其余跑次不受影响。
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

  const tFuncStart = Date.now();
  logger.info(
    "│ 单次采样-callOnce",
    "调用函数开始：callOnce",
    "为什么打：runGroup 里 N 次跑都共用这一层；不记 index / temperature / top_p，事后无法归因「哪一档参数产生了哪种说法」。当前：第 N 次采样即将发出请求。",
    {
      入参: { run: index, temperature: params.temperature, topP: params.topP, promptLen: prompt.length },
      __code: `const completion = await llm.openai.chat.completions.create(requestShape);`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全",
    "为什么打：本 Demo 唯一的真出网层；不打就没有 choices[0].finish_reason / usage 字段。当前：第 N 次采样即将发出 stream:false 请求；temperature / top_p 已落到请求体。",
    {
      入参: {
        run: index,
        model: requestShape.model,
        messagesCount: requestShape.messages.length,
        temperature: requestShape.temperature,
        top_p: requestShape.top_p,
        max_tokens: requestShape.max_tokens,
        promptPreview: prompt.slice(0, 60),
      },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(requestShape, null, 2)});`,
    },
  );

  try {
    const completion = await llm.openai.chat.completions.create(requestShape);
    logger.info(
      "││ 调用模型-对话补全",
      "调用模型结束：对话补全",
      "为什么打：要拿到 choices[0].finish_reason 区分 stop / length / content_filter，便于判断输出是不是被 max_tokens 截断。当前：await 已返回。",
      {
        返回值: {
          run: index,
          id: completion.id,
          model: completion.model,
          finishReason: completion.choices?.[0]?.finish_reason,
          usage: completion.usage,
        },
        耗时ms: Date.now() - tModelStart,
        字段释义: {
          "choices[0].finish_reason": "stop=正常 / length=撞 max_tokens / content_filter=被策略拦下",
          usage: "OpenAI 标准 usage 三字段（计费依据）",
        },
      },
    );

    // ② 先剥思考标记再回退到原文：剥完为空说明模型这次只输出了思考块，
    //    此时展示原文比展示空字符串更有信息量。
    const raw = completion.choices[0]?.message.content?.trim() ?? "";
    const visible = visibleText(raw);
    const run: SingleRun = {
      index,
      text: visible || raw || "(空回复)",
      durationMs: Math.round(performance.now() - startedAt),
    };

    logger.info(
      "│ 单次采样-callOnce",
      "调用函数结束：callOnce",
      "为什么打：runGroup 要把 SingleRun 收齐才能去重判稳；这里打返回形状便于核对「一条 = { index, text, durationMs }」。当前：剥思考标记 + 回退已完成。",
      {
        返回值: { index: run.index, textPreview: run.text.slice(0, 60), durationMs: run.durationMs },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return run;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      "││ 调用模型-对话补全",
      "调用模型结束：对话补全（失败）",
      "为什么打：拿到 upstreamStatus 才能区分 401/403（Key）、429（限流）、5xx（对方挂了）。当前：create 抛错；callOnce 不上抛所以本组其余跑次不受影响。",
      {
        返回值: {
          run: index,
          temperature: params.temperature,
          topP: params.topP,
          error: message,
          upstreamStatus: (error as { status?: number }).status,
        },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    logger.error(
      "│ 单次采样-callOnce",
      "调用函数结束：callOnce（失败）",
      "为什么打：runGroup 要按 SingleRun 形状回收——失败也要走同一条形状（带 error 字段）。当前：模型抛错，构造 SingleRun{index, text:'', durationMs, error}。",
      {
        返回值: { index, text: "", durationMs: Math.round(performance.now() - startedAt), error: message },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    // ③ 单次失败不上抛：一组里第 2 次挂掉，第 1 次的结果仍然要能看见。
    //    真正需要变成 HTTP 错误码的情形由 route 层的 writeUpstreamError 处理。
    return {
      index,
      text: "",
      durationMs: Math.round(performance.now() - startedAt),
      error: message,
    };
  }
}