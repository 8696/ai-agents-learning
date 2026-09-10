/**
 * 职责：手写 Agent Loop（核心控制流）。**本条教学点**。
 *
 * 数据流：
 *   messages: [{role, content}, ...]   ← 入参
 *     │
 *     │ while (没碰上停止条件 && round < MAX_ROUNDS)
 *     │   ├─ Reason：openai.chat.completions.create({ messages, tools })
 *     │   │   └─ assistant_message（可能含 tool_calls）
 *     │   ├─ ① 把 assistant_message 追加进 messages（让模型「记住」自己说过）
 *     │   ├─ 若 assistant_message.tool_calls 为空 → 最终答案 → break（变体 J）
 *     │   ├─ ② Act：对每个 tool_call 查 registry → execute → 拿到 {tool_call_id, content}
 *     │   ├─ ③ Observe：把 tool 消息按 OpenAI 协议追加进 messages（role: 'tool', tool_call_id）
 *     │   └─ 进下一圈
 *     │
 *     ▼
 *   返回 { trajectory, finalAnswer, stoppedReason, rounds }
 *
 * 停止条件（按本条 MD「是什么 ⑤ 停止条件」）：
 *   - 变体 J 最终答案：本圈 assistant_message.tool_calls 为空 → 正文即答案 → break
 *   - 保护型 MAX_ROUNDS：打到上限不再继续；轨迹照写、不抛错；UI 标「达到最大轮次」
 *
 * 本 step 只演示 J + MAX（兜底，不指望触发）；
 * step-2+ 加 K/L/M（用户取消 / 超时 / MAX 当主教学点）。
 *
 * 教学锚点（变体 H 多圈 / D 串行依赖 / J 最终答案）：
 *   - 真调 LLM（§5.3.0 强制：禁止 mock 凑闭环）
 *   - loop 写出完整轨迹（trajectory）给前端按圈展开 —— 让「循环在转」肉眼可见
 *   - 每圈日志（§5.3.16 五条日志 + 调用循环）：入参完整 messages / 返回值完整 / __code / 耗时
 *
 * 为什么单独成文件：loop = 控制流 = 本模块最核心的代码；与 tools / http / server 全部正交。
 * 后面 step 加并行 Act / 失败 Observe / 自纠 / 用户取消 → 在这一个文件加分支或加新 handler，
 * **不再新建 loop 文件**（否则「Loop 长什么样」会被拆碎）。
 */

import type OpenAI from "openai";
import { logger } from "../logger.js";
import { todoToolRegistry } from "../tools/todo-tools.js";

/** 简化版 tool_call：loop 自己用，跟 openai 的类型解耦（少 50 行导入噪音）。 */
export type ToolCallLite = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

/**
 * messages 数组的类型：直接复用 OpenAI SDK 原生 ChatCompletionMessageParam。
 *
 * **关键修复（2026-09-10）**：之前我自定义 ChatMessage 把 assistant 消息的 tool_calls 字段
 * 命名为 `tc`，发请求时 `as unknown as ...MessageParam[]` 强转。结果 OpenAI SDK 序列化时
 * 不认 `tc`，只认 `tool_calls` —— tool_calls 字段在请求体里**整体丢失**，模型下一圈
 * 看不见上圈调了哪个 tool / 哪个 id。下游 API 收到 tool_result 时找不到对应的
 * tool_call_id → 400 "tool result's tool id not found"。
 *
 * 修复：直接用 SDK 原生类型，不另起自定义形状。这样 `messages.push(...)` 时 SDK 校验
 * 形状，`tool_calls` 字段名永远正确，tool_call_id 引用关系跨圈保留。
 *
 * 教学锚点：这是 Loop 最经典的坑 —— 「messages 在跑什么阶段」不只是写对，还要让 SDK
 * 认得出每个字段。MD「易混点 / 踩坑」节里「假循环 = 结构只许一跳」是真假循环，
 * 这里「自定义消息类型丢了字段」是**真循环 + 真 Loop**，但 Loop 内部状态容器废了。
 */
type LlmMessage = OpenAI.Chat.ChatCompletionMessageParam;

/** 导出别名给 routes/agent.ts 构造 initialMessages 用 */
export type ChatMessage = LlmMessage;

/** 一圈的可观察产物：给前端 / 日志看的轨迹 */
export type TrajectoryStep = {
  round: number;
  /** Reason 阶段：模型返回的 assistant 消息（content + tool_calls） */
  assistant: {
    content: string | null;
    tc: ToolCallLite[];
  };
  /** Act + Observe 阶段：本圈每个 tool_call 的执行结果；空数组 = 没 Act */
  toolResults: Array<{
    tool_call_id: string;
    name: string;
    arguments: unknown;
    content: string;
  }>;
  /** 这一圈耗时（毫秒；含 LLM 调用 + tool 执行） */
  elapsedMs: number;
};

export type LoopResult = {
  trajectory: TrajectoryStep[];
  finalAnswer: string;
  /** 解释为什么停：final_answer | max_rounds */
  stoppedReason: "final_answer" | "max_rounds";
  rounds: number;
  /** 跑完后 messages 数组（含 system / user / 多圈 assistant+tool）—— 给前端做「完整 Context」展示 */
  finalMessages: LlmMessage[];
};

export type RunLoopParams = {
  openai: OpenAI;
  model: string;
  initialMessages: LlmMessage[];
  /** 兜底；打到就停，不抛错。本条演示默认 6，足够 list + 1~2 complete + 最终答案。 */
  maxRounds?: number;
};

/** 本 step 的停止条件只有「最终答案 / max_rounds」两种。其它留 step-2+。 */
export async function runAgentLoop(params: RunLoopParams): Promise<LoopResult> {
  const { openai, model, initialMessages } = params;
  const maxRounds = params.maxRounds ?? 6;

  // messages 是循环**唯一**的状态容器：每圈改一次（追加 assistant + tool）
  // 类型 = OpenAI SDK 原生，序列化时 tool_calls 字段名 / tool_call_id 引用关系正确。
  const messages: LlmMessage[] = [...initialMessages];
  const trajectory: TrajectoryStep[] = [];

  let round = 0;
  let finalAnswer = "";
  let stoppedReason: LoopResult["stoppedReason"] = "final_answer";

  while (round < maxRounds) {
    round += 1;

    logger.info("│ 调用循环", "调用循环开始：" + `第 ${round} 轮 / 共 ${maxRounds} 轮`,
      "为什么写这条日志：本条教学点 = Loop 在转；不每圈都写完整，事后只看日志讲不清「圈 N 发生了什么」。当前：即将发请求让模型 Reason。",
      {
        第几轮: round,
        本轮为什么是这些参数: {
          messages: "累积到目前为止全部 messages（含 system / user / 多圈 assistant+tool）—— Loop 的唯一状态容器",
          tools: `本条 2 个 tool：${todoToolRegistry.definitions.map(t => t.function.name).join(" / ")}`,
        },
      });

    const tRound0 = Date.now();

    // ── Reason：调一次 LLM ──
    const request: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
      tools: todoToolRegistry.definitions as unknown as OpenAI.Chat.ChatCompletionTool[],
    };

    logger.info("││ 调用模型-对话补全", "调用模型开始：对话补全",
      "为什么写这条日志：这是真发网络请求的那一次，不写就讲不清这一圈 Reason 看见了什么。当前：第 " + round + " 圈，messages 累积了 " + messages.length + " 条。",
      {
        入参: request,
        __code: "const completion = await openai.chat.completions.create(request);",
      });

    const t0 = Date.now();
    let completion;
    try {
      completion = await openai.chat.completions.create(request);
    } catch (err: unknown) {
      logger.error("││ 调用模型-对话补全", "调用模型结束：对话补全（失败）",
        "为什么写这条日志：网络/限流/超时 等真发请求的失败；不能让 Loop 静默死掉。当前：await 抛错；下一步直接把错误冒到路由层回 502。",
        { error: err, 耗时ms: Date.now() - t0 });
      throw err;
    }

    const assistantMessage = completion.choices[0]?.message;
    const rawToolCalls = assistantMessage?.tool_calls ?? [];
    const toolCalls: ToolCallLite[] = rawToolCalls.map((c) => ({
      id: c.id,
      type: "function" as const,
      function: { name: c.function.name, arguments: c.function.arguments },
    }));
    const assistantContent = assistantMessage?.content ?? null;

    logger.info("││ 调用模型-对话补全", "调用模型结束：对话补全",
      "为什么写这条日志：要拿到 tool_calls 决定下一步是 Act 还是最终答案；finish_reason 是关键判据。当前：已返回。",
      {
        返回值: {
          choices: completion.choices,
          usage: completion.usage ?? null,
          finish_reason: completion.choices[0]?.finish_reason,
        },
        字段释义: {
          "choices[0].finish_reason": "tool_calls = 还要做；stop = 正文即最终答案；length = 截断",
          "choices[0].message.tool_calls": "本圈模型决定要调的工具列表；空数组 = 变体 J 最终答案",
          "choices[0].message.content": "本圈 assistant 文本（可能为 null 当只调工具）",
        },
        耗时ms: Date.now() - t0,
      });

    // ── ① 把 assistant_message 追加进 messages（让模型下一圈能看到自己刚才说了什么）──
    // 用 SDK 原生形状：tool_calls 字段名正确 → 下一圈 tool_result 能引用回 tool_call_id。
    messages.push({
      role: "assistant",
      content: assistantContent,
      tool_calls: rawToolCalls.map((c) => ({
        id: c.id,
        type: "function" as const,
        function: c.function,
      })),
    });

    // ── 停止条件 J：最终答案（tool_calls 为空）──
    if (toolCalls.length === 0) {
      finalAnswer = assistantContent ?? "";
      stoppedReason = "final_answer";
      trajectory.push({
        round,
        assistant: { content: assistantContent, tc: [] },
        toolResults: [],
        elapsedMs: Date.now() - tRound0,
      });
      logger.info("│ 调用循环", `调用循环结束：第 ${round} 轮（最终答案 · 变体 J）`,
        "为什么写这条日志：本圈 tool_calls 空 → 模型认为做完了；正文就是最终答案，break。当前：loop 退出。",
        { 最终答案: finalAnswer, 耗时ms: Date.now() - tRound0 });
      break;
    }

    // ── ② Act + ③ Observe：对每个 tool_call 查 registry → execute → 写 tool 消息 ──
    // step-2 增量（变体 E 并行 Act）：用 Promise.all 同时启动所有 handler。
    // 注意：完成顺序 ≠ toolCalls 数组顺序（先返回的先 push 进 messages / 先进 toolResults）。
    // step-1 串行 `for await` 时顺序固定；step-2 并行后顺序由 handler 完成时机决定。
    // OpenAI Messages API tool 消息靠 tool_call_id 引用，跟 push 顺序无关，所以并行安全。
    const toolResults: TrajectoryStep["toolResults"] = [];
    const parallelSettled = await Promise.all(
      toolCalls.map(async (call): Promise<{
        call: typeof call;
        parsedArgs: unknown;
        ok: boolean;
        content: string;
        elapsedMs: number;
        errorReason?: string;
        error?: unknown;
      }> => {
        const tTool0 = Date.now();
        const handler = todoToolRegistry.handlers.get(call.function.name);
        if (!handler) {
          return {
            call,
            parsedArgs: safeParseArgs(call.function.arguments),
            ok: false,
            content: JSON.stringify({ ok: false, error: "unknown_tool", name: call.function.name }),
            elapsedMs: Date.now() - tTool0,
            errorReason: "unknown_tool",
          };
        }

        let parsedArgs: unknown;
        try {
          parsedArgs = safeParseArgs(call.function.arguments);
        } catch (err: unknown) {
          return {
            call,
            parsedArgs: call.function.arguments,
            ok: false,
            content: JSON.stringify({ ok: false, error: "args_parse_failed", message: (err as Error).message }),
            elapsedMs: Date.now() - tTool0,
            errorReason: "args_parse_failed",
            error: err,
          };
        }

        try {
          const { content } = await handler(call.function.arguments);
          return {
            call,
            parsedArgs,
            ok: true,
            content,
            elapsedMs: Date.now() - tTool0,
          };
        } catch (err: unknown) {
          return {
            call,
            parsedArgs,
            ok: false,
            content: JSON.stringify({ ok: false, error: "tool_threw", message: (err as Error).message }),
            elapsedMs: Date.now() - tTool0,
            errorReason: "tool_threw",
            error: err,
          };
        }
      }),
    );

    // ── 把并行结果按 OpenAI 协议塞回 messages（push 顺序：并行完成顺序，不是 toolCalls 数组顺序）──
    for (const r of parallelSettled) {
      messages.push({ role: "tool", tool_call_id: r.call.id, content: r.content });
      toolResults.push({
        tool_call_id: r.call.id,
        name: r.call.function.name,
        arguments: r.parsedArgs,
        content: r.content,
      });
    }

    // ── 日志：每个 tool_call 各打五条（含入参完整 arguments + 返回值完整 content + 耗时）──
    // 并行所以打开始日志意义不大（无法知道哪个先开始）—— 改在结束后按并行结果各自打「结果」日志。
    for (const r of parallelSettled) {
      if (r.errorReason === "unknown_tool") {
        logger.warn("││ 调用函数-execute", "调用函数结束：" + r.call.function.name + "（失败）",
          "为什么写这条日志：模型调了一个 registry 里没有的工具；必须把错误当 Observe 写回 messages，让模型下一圈能修正。当前：本 tool_call 写错误进 tool 消息。",
          { tool_call_id: r.call.id, name: r.call.function.name, 错误: "unknown_tool" });
      } else if (r.errorReason === "args_parse_failed") {
        logger.warn("││ 调用函数-execute", "调用函数结束：" + r.call.function.name + "（失败）",
          "为什么写这条日志：模型给的 arguments 不是合法 JSON —— 不抛、塞回 Observe；变体 G 雏形。当前：tool_call_id=" + r.call.id,
          { tool_call_id: r.call.id, name: r.call.function.name, 错误: "args_parse_failed", error: r.error });
      } else if (r.ok) {
        logger.info("││ 调用函数-" + r.call.function.name, "调用函数结束：" + r.call.function.name,
          "为什么写这条日志：要把返回值塞回 messages 当 Observe，让模型下一圈能读。变体 E 并行：本 tool_call 跟其它 tool_call 同时执行，耗时是它自己的，不是整圈相加。当前：tool 消息已追加。",
          { tool_call_id: r.call.id, 入参: { tool_call_id: r.call.id, arguments: r.parsedArgs }, 返回值: r.content, 耗时ms: r.elapsedMs, __code: "const { content } = await handler(JSON.stringify(parsedArgs));" });
      } else {
        logger.error("││ 调用函数-" + r.call.function.name, "调用函数结束：" + r.call.function.name + "（失败）",
          "为什么写这条日志：handler throw 了 —— 必须把错误当 Observe 写回，不能让 Loop 死掉（变体 G）。变体 E 并行：本 tool_call 跟其它同时执行。当前：tool 消息已写错误。",
          { tool_call_id: r.call.id, 入参: { tool_call_id: r.call.id, arguments: r.parsedArgs }, error: r.error, 耗时ms: r.elapsedMs });
      }
    }

    // ── 变体 E 总耗时 = max(单个 tool_call 耗时)，不是 sum（这是 Promise.all vs for await 的核心差异）──
    const parallelMaxToolMs = parallelSettled.length > 0 ? Math.max(...parallelSettled.map(r => r.elapsedMs)) : 0;
    const parallelSumToolMs = parallelSettled.reduce((s, r) => s + r.elapsedMs, 0);
    logger.info("││ 调用函数-并行汇总", "调用函数结束：并行汇总（变体 E）",
      "为什么写这条日志：让学习者一眼看到 Promise.all 后单圈耗时 = max(各 tool_call)，对比串行会是 sum。当前：第 " + round + " 圈有 " + parallelSettled.length + " 个 tool_call 并行执行。",
      {
        parallelCount: parallelSettled.length,
        实际并行耗时ms: parallelMaxToolMs,
        若串行总耗时ms: parallelSumToolMs,
        节省ms: parallelSumToolMs - parallelMaxToolMs,
      });

    trajectory.push({
      round,
      assistant: { content: assistantContent, tc: toolCalls },
      toolResults,
      elapsedMs: Date.now() - tRound0,
    });

    logger.info("│ 调用循环", `调用循环结束：第 ${round} 轮`,
      "为什么写这条日志：本圈 Act+Observe 已写进 messages，下一圈 Reason 会读到。当前：trajectory 加 1 行；继续 while。",
      {
        本轮轨迹: {
          assistantContent: assistantContent,
          toolCalls: toolCalls.map(c => ({ id: c.id, name: c.function.name, arguments: c.function.arguments })),
          toolResultsCount: toolResults.length,
        },
        耗时ms: Date.now() - tRound0,
      });

    // 注：step-1 不内置 K（max 当教学点）+ L（超时）+ M（用户取消）；变体 J 是本 step 唯一「主出口」。
    // K 在这里只作兜底（while 条件 round < maxRounds），不指望触发。
  }

  if (round >= maxRounds && stoppedReason === "final_answer") {
    // 走到这里只可能是 stoppedReason 没被 J 设过 —— 说明 while 是被条件 break 而不是被 J break，
    // 即 MAX 兜底触发。
    stoppedReason = "max_rounds";
    logger.warn("调用循环-loop", "调用循环结束：MAX_ROUNDS 兜底触发",
      "为什么写这条日志：本 step 把 max 当兜底；若跑到这里说明任务模型一直没收敛（变体 K · 不指望触发）。",
      { round, maxRounds });
  }

  return {
    trajectory,
    finalAnswer: finalAnswer || "（模型未给出最终答案 · 任务未收敛）",
    stoppedReason,
    rounds: round,
    finalMessages: messages,
  };
}

function safeParseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { __raw: raw };
  }
}
