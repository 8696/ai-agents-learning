/**
 * 职责：编排者-工人（Orchestrator-Workers）模式 —— 先拆成 N 个子任务，同时查，再汇总成一段。
 *
 * 数据流：orderSlip → 编排者 LLM 拆 fanOutTasks → Promise.all N 个菜单员 LLM → 汇总者 LLM 写 guestReply。
 *
 * 为什么单独成文件：本步核心 = 编排者的一次「拆 + 并行 + 汇总」三段，对照 step-1 的 supervisor 一次只派一个；
 * 学习者打开这一个文件就能把并行 fan-out / fan-in 的形状看完。
 * 真发网络请求 = 「调用模型」（N+2 次：1 编排 + N 工人并行 + 1 汇总）；
 * 外面再包一层 runOrchestrator = 「调用函数」。
 *
 * 教学点（对应模块 14 · 01 · Supervisor 模式 · 需求 2）：
 *   1. 先拆：编排者 LLM 把客人一句话拆成 N 个互不依赖的子任务（这一步必须用 LLM 判依赖，不能硬编码）
 *   2. 同时做：N 个菜单员 LLM 调用走 Promise.all 并行；总耗时 ≈ max(t_i)，不是 sum(t_i)
 *   3. 再汇总：汇总者 LLM 把 N 份结果拼成一段给客人的答复
 *   4. 与 step-1 的差别：这里没有「做完一个再决定下一个」；任务列表是「一次性写出来的」
 */
import { z } from "zod-v4";
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";
import {
  ORCHESTRATOR_SYSTEM,
  WORKER_SYSTEM,
  AGGREGATOR_SYSTEM,
} from "./prompts.js";
import {
  orchestratorSchema,
  workerSchema,
  aggregatorSchema,
  safeJsonParse,
} from "./schemas.js";
import {
  initialOrchestratorState,
  type OrchestratorOutput,
  type OrchestratorState,
  type WorkerTrace,
} from "./types.js";

export { initialOrchestratorState };
export type { OrchestratorState, OrchestratorOutput, WorkerTrace };

export async function runOrchestrator(input: { orderSlip: string }): Promise<OrchestratorOutput> {
  const llm = getLlm();
  const client = llm.openai;
  const totalT0 = Date.now();

  logger.info(
    "│ 调用函数-runOrchestrator",
    "调用函数开始：runOrchestrator",
    "为什么写这条日志：本步核心——编排者 fan-out + 并行 worker + fan-in 三段；对照 step-1 的逐轮 supervisor 一次只派一个。当前：刚收到「" + input.orderSlip + "」",
    { 入参: input, __code: "const out = await runOrchestrator({ orderSlip });" },
  );

  // ── ① 编排者：拆成 N 个子任务 ──
  const orchestratorRequest = {
    model: llm.modelA,
    messages: [
      { role: "system" as const, content: ORCHESTRATOR_SYSTEM(input.orderSlip) },
      { role: "user" as const, content: "请拆任务。" },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: "orchestrator_decomposition",
        strict: true,
        schema: z.toJSONSchema(orchestratorSchema) as Record<string, unknown>,
      },
    },
  };
  logger.info(
    "│ │ 调用模型-openai.chat.completions",
    "调用模型开始：编排者拆任务",
    "为什么写这条日志：编排者一次拆 N 个互不依赖子任务。当前：把 orderSlip 拼成系统提示词，要模型输出 { tasks, reasoning }。",
    { 入参: orchestratorRequest, __code: "const resp = await client.chat.completions.create(orchestratorRequest);" },
  );
  const orchestratorT0 = Date.now();
  const orchestratorResp = await client.chat.completions.create(orchestratorRequest);
  const orchestratorParsed = await safeJsonParse(orchestratorSchema, orchestratorResp.choices[0]?.message?.content ?? "{}", "编排者");
  const orchestratorElapsed = Date.now() - orchestratorT0;
  logger.info(
    "│ │ 调用模型-openai.chat.completions",
    "调用模型结束：编排者拆任务",
    "为什么写这条日志：拿到 N 个子任务，下一步并行跑。当前：parse 完成。",
    { 返回值: orchestratorResp, parsed: orchestratorParsed, 耗时ms: orchestratorElapsed },
  );

  // ── ② N 个菜单员并行 ──
  const workersT0 = Date.now();
  const workerPromises = orchestratorParsed.tasks.map(async (task, idx): Promise<WorkerTrace> => {
    const t0 = Date.now();
    const req = {
      model: llm.modelA,
      messages: [
        { role: "system" as const, content: WORKER_SYSTEM(input.orderSlip, task.drink) },
        { role: "user" as const, content: "请查这一杯今日能不能做。" },
      ],
      response_format: {
        type: "json_schema" as const,
        json_schema: {
          name: "worker_" + idx,
          strict: true,
          schema: z.toJSONSchema(workerSchema) as Record<string, unknown>,
        },
      },
    };
    logger.info(
      "│ │ 调用模型-openai.chat.completions",
      "调用模型开始：菜单员 " + (idx + 1) + " / " + orchestratorParsed.tasks.length,
      "为什么写这条日志：N 个菜单员走 Promise.all 并行跑；每个独立打日志便于看耗时差距。当前：idx=" + idx + " drink=" + task.drink,
      { 入参: req, __code: "const resp = await client.chat.completions.create(req);" },
    );
    const resp = await client.chat.completions.create(req);
    const parsed = await safeJsonParse(workerSchema, resp.choices[0]?.message?.content ?? "{}", "菜单员#" + (idx + 1));
    const elapsedMs = Date.now() - t0;
    logger.info(
      "│ │ 调用模型-openai.chat.completions",
      "调用模型结束：菜单员 " + (idx + 1) + " / " + orchestratorParsed.tasks.length,
      "为什么写这条日志：每个菜单员各自打耗时，便于对照并行总耗时 ≈ max 而不是 sum。当前：parse 完成。",
      { 返回值: resp, parsed, 耗时ms: elapsedMs },
    );
    return {
      drink: task.drink,
      // 归一 boolean：null 当 false（菜单员模型偶发返 null）
      available: parsed.available === true,
      note: parsed.note,
      reasoning: parsed.reasoning,
      elapsedMs,
    };
  });
  const workerResults = await Promise.all(workerPromises);
  const workersElapsed = Date.now() - workersT0;

  // ── ③ 汇总者：把 N 份拼成一段 ──
  const aggregatorRequest = {
    model: llm.modelA,
    messages: [
      { role: "system" as const, content: AGGREGATOR_SYSTEM(input.orderSlip, workerResults) },
      { role: "user" as const, content: "请汇总成一段给客人的答复。" },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: "aggregator_merge",
        strict: true,
        schema: z.toJSONSchema(aggregatorSchema) as Record<string, unknown>,
      },
    },
  };
  logger.info(
    "│ │ 调用模型-openai.chat.completions",
    "调用模型开始：汇总者",
    "为什么写这条日志：汇总者等所有菜单员跑完才动；fan-in 这一跳。当前：workerResults 全部到手，拼成系统提示词。",
    { 入参: aggregatorRequest, __code: "const resp = await client.chat.completions.create(aggregatorRequest);" },
  );
  const aggregatorT0 = Date.now();
  const aggregatorResp = await client.chat.completions.create(aggregatorRequest);
  const aggregatorParsed = await safeJsonParse(aggregatorSchema, aggregatorResp.choices[0]?.message?.content ?? "{}", "汇总者");
  const aggregatorElapsed = Date.now() - aggregatorT0;
  logger.info(
    "│ │ 调用模型-openai.chat.completions",
    "调用模型结束：汇总者",
    "为什么写这条日志：拿到 guestReply，状态写完。当前：parse 完成。",
    { 返回值: aggregatorResp, parsed: aggregatorParsed, 耗时ms: aggregatorElapsed },
  );

  const state: OrchestratorState = {
    orderSlip: input.orderSlip,
    fanOutTasks: orchestratorParsed.tasks,
    workerResults,
    guestReply: aggregatorParsed.guestReply,
  };
  const out: OrchestratorOutput = {
    state,
    stages: {
      orchestrator: { tasks: orchestratorParsed.tasks, reasoning: orchestratorParsed.reasoning, elapsedMs: orchestratorElapsed },
      workers: workerResults,
      aggregator: { guestReply: aggregatorParsed.guestReply, reasoning: aggregatorParsed.reasoning, elapsedMs: aggregatorElapsed },
    },
    totalElapsedMs: Date.now() - totalT0,
  };

  logger.info(
    "│ 调用函数-runOrchestrator",
    "调用函数结束：runOrchestrator",
    "为什么写这条日志：编排者-工人全跑完。前端看到 fan-out + 并行 + fan-in 三段 + 总耗时，对照 step-1 逐轮的总耗时 = sum(rounds)。当前：返回完整轨迹。",
    { 返回值: out, 耗时ms: out.totalElapsedMs, workersElapsed },
  );
  return out;
}
