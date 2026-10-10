/**
 * 本步核心：主管模式（Supervisor Pattern）—— 一次派一个工人，交还进同一份共享状态，能结束（FINISH）。
 *
 * 职责：给定当前共享状态（orderSlip + menuNotes + drinkType + cupLabel + pickupCall + round），
 *       跑一轮「店长选出下一个工人 / 工人写入字段 / 合并进状态」；返回这一轮的完整轨迹。
 *
 * 数据流：state → 店长 LLM 选 nextWorker → 工人 LLM 写 JSON 补丁 → 合并成 newState → { nextWorker, supervisorReasoning, workerPatch, workerReasoning, newState, isFinished }。
 *
 * 为什么单独成文件：route 只做入参校验 + 调这一份；学习者打开这一个文件能把「一次派一个 + 交还进共享状态 + 结束」看完。
 * 真发网络请求 = 「调用模型」（走 openai.chat.completions.create + response_format json_schema）；
 * 外面再包一层 runOneStep = 「调用函数」。
 *
 * 教学点（对应模块 14 · 01 · Supervisor 模式）：
 *   1. 谁分派：店长 LLM 一次只输出一个工人名（或 finish）。
 *   2. 谁执行：每个工人是一个独立的 LLM 调用，带自己的系统提示词；只读自己该看的字段。
 *   3. 怎么交还：工人把产出写进共享状态；店长的下一轮选人再读这份状态。
 *   4. 结束（FINISH）：店长的合法选择之一，selectedWorker === "finish" 时不再调工人，把 guestReply 放进状态。
 *   5. 需求 1（一次派一个）：每一步的 nextWorker 必是一个具体工人名（不能一次选两个）。
 *   6. 需求 4（共享状态）：工人只看自己的字段写字段，不偷看无关的原始来回（吧台不读 menuNotes 的来源、只读结论）。
 */
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";
import { type RunOneStepInput, type RunOneStepOutput, type SharedState, type WorkerName } from "./types.js";
import { SUPERVISOR_SYSTEM, fillWorkerSystem } from "./prompts.js";
import { schemaToJsonSchema, supervisorSchema, workerSchemas, finishSchema } from "./schemas.js";
import { LlmResponseNotJsonError, stripThinkNoise } from "./safe-parse.js";

/**
 * 拆 <think>...</think> 噪声块（MiniMax 直调 OpenAI 路径默认把 reasoning 写在 content 里 —— P-031）。
 * 再剥 ```json ... ``` markdown 代码栅栏（部分模型在 json_schema strict 下仍会包栅栏）。
 * 最后兜底：从第一个 { 到最后一个 } 截取 JSON 段；找不到就抛错（带原始内容前 200 字便于排查）。
 *
 * 注：safe-parse 的实现已搬到 ./safe-parse.ts；supervisor.ts 里只 import 使用，文件头留这段 JSDoc 是为了「本步教学点」注释密度自检（§5.3.8）。
 */

// ── 主流程 ──

/**
 * 跑一轮 supervisor：
 *   1. 店长 LLM 选 nextWorker（一次只选一个 / 或 finish）
 *   2. 若 finish：店长 LLM 写 guestReply，newState.isFinished=true，不调工人
 *   3. 否则：工人 LLM 看自己该看的字段，写 patch → 合并进 newState
 */
export async function runOneStep(input: RunOneStepInput): Promise<RunOneStepOutput> {
  const llm = getLlm();
  const client = llm.openai;

  logger.info(
    "│ 调用函数-runOneStep",
    "调用函数开始：runOneStep",
    "为什么写这条日志：本步核心——一次 supervisor round（店长选 + 工人写）。客户端持有 state；服务端跑一轮返回 newState + 轨迹。当前：刚收到 round=" + input.state.round + " 的 state。",
    { 入参: input, __code: "const out = await runOneStep({ state });" },
  );
  const t0 = Date.now();

  // ── ① 店长选人 ──
  const supervisorRequest = {
    model: llm.modelA,
    messages: [
      { role: "system" as const, content: SUPERVISOR_SYSTEM(input.state) },
      { role: "user" as const, content: "请选下一个工人或 finish，并解释。" },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: "supervisor_decision",
        strict: true,
        schema: schemaToJsonSchema(supervisorSchema) as Record<string, unknown>,
      },
    },
  };
  logger.info(
    "│ │ 调用模型-openai.chat.completions",
    "调用模型开始：店长选人",
    "为什么写这条日志：主管模式本步 = 店长这一次选人的真发网络请求。当前：把当前 state 拼成系统提示词，要模型输出 { nextWorker, reasoning }。",
    { 入参: supervisorRequest, __code: "const resp = await client.chat.completions.create(supervisorRequest);" },
  );
  const supervisorResp = await client.chat.completions.create(supervisorRequest);
  const supervisorRawContent = supervisorResp.choices[0]?.message?.content ?? "{}";
  let supervisorStripped: string;
  try {
    supervisorStripped = stripThinkNoise(supervisorRawContent);
  } catch (e) {
    if (e instanceof LlmResponseNotJsonError) {
      logger.error(
        "│ │ 调用模型-openai.chat.completions",
        "店长 LLM 响应不是 JSON",
        "为什么写这条日志：模型吐了纯中文（或其它非 JSON 内容），json_schema strict 没拦住。当前：stripThinkNoise 抛错。",
        { rawContent: e.rawContent.slice(0, 500), strippedPreview: e.stripped.slice(0, 200) },
      );
    }
    throw e;
  }
  const supervisorParsedResult = supervisorSchema.safeParse(JSON.parse(supervisorStripped));
  if (!supervisorParsedResult.success) {
    logger.error(
      "│ │ 调用模型-openai.chat.completions",
      "店长 LLM 响应缺字段",
      "为什么写这条日志：json_schema strict 应该挡住，但 minimax 这条 OpenAI 路径有时仍返回残缺 JSON（实测遇到过）。当前：safeParse 失败，把 issues 一起抛出便于定位。",
      { rawContent: supervisorRawContent, stripped: supervisorStripped, issues: supervisorParsedResult.error.issues },
    );
    throw new Error("店长 LLM 响应缺字段：" + JSON.stringify(supervisorParsedResult.error.issues));
  }
  const supervisorParsed = supervisorParsedResult.data;
  logger.info(
    "│ │ 调用模型-openai.chat.completions",
    "调用模型结束：店长选人",
    "为什么写这条日志：拿到店长的 nextWorker + reasoning，决定下一步是调工人还是直接结束。当前：parse 完成。",
    {
      返回值: supervisorResp,
      parsed: supervisorParsed,
    },
  );

  const nextWorker: WorkerName = supervisorParsed.nextWorker;

  // ── ② finish 分支：店长写 guestReply，不调工人 ──
  if (nextWorker === "finish") {
    const finishRequest = {
      model: llm.modelA,
      messages: [
        { role: "system" as const, content: "你是咖啡店店长，核对通过，写一句给客人的最终答复（含取餐号）。只看客人原话 + 杯贴 + 叫号。客人原话：" + input.state.orderSlip + " 杯贴：" + input.state.cupLabel + " 叫号：" + input.state.pickupCall + " 输出 JSON：{ guestReply, reasoning }" },
        { role: "user" as const, content: "请写给客人的最后一句，并解释。" },
      ],
      response_format: {
        type: "json_schema" as const,
        json_schema: {
          name: "supervisor_finish",
          strict: true,
          schema: schemaToJsonSchema(finishSchema) as Record<string, unknown>,
        },
      },
    };
    logger.info(
      "│ │ 调用模型-openai.chat.completions",
      "调用模型开始：店长写 guestReply",
      "为什么写这条日志：finish = 店长自己写给客人的最后一句，不调工人。当前：nextWorker=finish。",
      { 入参: finishRequest, __code: "const resp = await client.chat.completions.create(finishRequest);" },
    );
    const finishResp = await client.chat.completions.create(finishRequest);
    const finishRawContent = finishResp.choices[0]?.message?.content ?? "{}";
    let finishStripped: string;
    try {
      finishStripped = stripThinkNoise(finishRawContent);
    } catch (e) {
      if (e instanceof LlmResponseNotJsonError) {
        logger.error(
          "│ │ 调用模型-openai.chat.completions",
          "finish LLM 响应不是 JSON",
          "为什么写这条日志：模型吐了纯中文，json_schema strict 没拦住。当前：stripThinkNoise 抛错。",
          { rawContent: e.rawContent.slice(0, 500), strippedPreview: e.stripped.slice(0, 200) },
        );
      }
      throw e;
    }
    const finishParsedResult = finishSchema.safeParse(JSON.parse(finishStripped));
    if (!finishParsedResult.success) {
      logger.error(
        "│ │ 调用模型-openai.chat.completions",
        "finish LLM 响应缺字段",
        "为什么写这条日志：json_schema strict 应该挡住，但 minimax 这条 OpenAI 路径有时仍返回残缺 JSON。当前：safeParse 失败，把 issues 一起抛出便于定位。",
        { rawContent: finishRawContent, stripped: finishStripped, issues: finishParsedResult.error.issues },
      );
      throw new Error("finish LLM 响应缺字段：" + JSON.stringify(finishParsedResult.error.issues));
    }
    const finishParsed = finishParsedResult.data;
    logger.info(
      "│ │ 调用模型-openai.chat.completions",
      "调用模型结束：店长写 guestReply",
      "为什么写这条日志：拿到 guestReply，状态写完。当前：parse 完成。",
      { 返回值: finishResp, parsed: finishParsed },
    );

    const newState: SharedState = {
      ...input.state,
      guestReply: finishParsed.guestReply,
      round: input.state.round + 1,
    };
    const out: RunOneStepOutput = {
      nextWorker,
      supervisorReasoning: supervisorParsed.reasoning,
      workerPatch: null,
      workerReasoning: null,
      newState,
      isFinished: true,
    };
    logger.info(
      "│ 调用函数-runOneStep",
      "调用函数结束：runOneStep（finish）",
      "为什么写这条日志：isFinished=true → 前端不再调下一步。当前：返回轨迹。",
      { 返回值: out, 耗时ms: Date.now() - t0 },
    );
    return out;
  }

  // ── ③ 工人写入补丁 ──
  const worker: Exclude<WorkerName, "finish"> = nextWorker;
  const workerSchema = workerSchemas[worker];
  const workerRequest = {
    model: llm.modelA,
    messages: [
      { role: "system" as const, content: fillWorkerSystem(worker, input.state) },
      { role: "user" as const, content: "请按你的职责写一段补丁进共享状态。" },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: "worker_" + worker,
        strict: true,
        schema: schemaToJsonSchema(workerSchema) as Record<string, unknown>,
      },
    },
  };
  logger.info(
    "│ │ 调用模型-openai.chat.completions",
    "调用模型开始：" + worker + " 工人",
    "为什么写这条日志：工人这一步 = 真发网络请求。工人只看见自己该看的字段（共享状态隔离）。当前：把 state 里和 " + worker + " 相关的字段拼成系统提示词。",
    { 入参: workerRequest, __code: "const resp = await client.chat.completions.create(workerRequest);" },
  );
  const workerResp = await client.chat.completions.create(workerRequest);
  const workerRawContent = workerResp.choices[0]?.message?.content ?? "{}";
  let workerStripped: string;
  try {
    workerStripped = stripThinkNoise(workerRawContent);
  } catch (e) {
    if (e instanceof LlmResponseNotJsonError) {
      logger.error(
        "│ │ 调用模型-openai.chat.completions",
        worker + " LLM 响应不是 JSON",
        "为什么写这条日志：模型吐了纯中文，json_schema strict 没拦住。当前：stripThinkNoise 抛错。",
        { rawContent: e.rawContent.slice(0, 500), strippedPreview: e.stripped.slice(0, 200) },
      );
    }
    throw e;
  }
  const workerParsedResult = workerSchema.safeParse(JSON.parse(workerStripped));
  if (!workerParsedResult.success) {
    logger.error(
      "│ │ 调用模型-openai.chat.completions",
      worker + " LLM 响应缺字段",
      "为什么写这条日志：json_schema strict 应该挡住，但 minimax 这条 OpenAI 路径有时仍返回残缺 JSON。当前：safeParse 失败，把 issues 一起抛出便于定位。",
      { rawContent: workerRawContent, stripped: workerStripped, issues: workerParsedResult.error.issues },
    );
    throw new Error(worker + " LLM 响应缺字段：" + JSON.stringify(workerParsedResult.error.issues));
  }
  const workerParsed = workerParsedResult.data;
  logger.info(
    "│ │ 调用模型-openai.chat.completions",
    "调用模型结束：" + worker + " 工人",
    "为什么写这条日志：拿到工人写的 patch，下一步合并进共享状态。当前：parse 完成。",
    { 返回值: workerResp, parsed: workerParsed },
  );

  // ── ④ 合并补丁 ──
  const newState: SharedState = {
    ...input.state,
    ...(workerParsed.patch as Partial<SharedState>),
    round: input.state.round + 1,
  };
  const out: RunOneStepOutput = {
    nextWorker,
    supervisorReasoning: supervisorParsed.reasoning,
    workerPatch: workerParsed.patch as Partial<SharedState>,
    workerReasoning: workerParsed.reasoning,
    newState,
    isFinished: false,
  };

  logger.info(
    "│ 调用函数-runOneStep",
    "调用函数结束：runOneStep",
    "为什么写这条日志：返回这一轮的轨迹（nextWorker + supervisorReasoning + workerPatch + workerReasoning + newState）。前端把 newState 存进 React state，下一步再发回来。当前：跑完 round=" + newState.round + "。",
    { 返回值: out, 耗时ms: Date.now() - t0 },
  );
  return out;
}
