/**
 * 职责：一步步走（变体 A · ReAct）—— mock 模型固定 7 圈，每圈看完再决定下一步。
 * 数据流：task → mock Reason 序列 → 每圈 invokeTool → trajectory + finalAnswer。
 * 为什么单独成文件：对照左栏自己的请求只跑这一条；禁止和规划路径塞进同一个 handler。
 */

import { logger } from "../logger.js";
import { invokeTool } from "../tools/ops.js";
import type { Round, ToolCall } from "../types.js";

export async function runStepByStep(task: string): Promise<{
  task: string;
  trajectory: Round[];
  summary: { rounds: number; modelCalls: number; firstActIndex: number };
  finalAnswer: string;
}> {
  const t0 = Date.now();
  logger.info(
    "调用循环-A-一步步走",
    "调用循环开始：一步步走（变体 A · ReAct）",
    "为什么写这条日志：本路径是上一节 Agent Loop 同款「每圈 Reason 决定下一刻」，本条 demo 用来对照「先规划」的形状差异。当前：用户任务刚进来。",
    { 入参: { task }, __code: "const trajectory: Round[] = []; for (let i = 0; i < 7; i++) { ... }" },
  );

  const MOCK_TURNS: Array<{ thought: string; calls: ToolCall[] }> = [
    { thought: "先查 SKU-88 库存", calls: [{ tool: "query_stock", args: { sku: "SKU-88" } }] },
    { thought: "再查 SKU-89", calls: [{ tool: "query_stock", args: { sku: "SKU-89" } }] },
    { thought: "查 SKU-90", calls: [{ tool: "query_stock", args: { sku: "SKU-90" } }] },
    { thought: "SKU-88 有货 12 件，写文案", calls: [{ tool: "write_copy", args: { sku: "SKU-88", copy: "春季新品 · 88 款 · 清新上市" } }] },
    { thought: "SKU-89 有货 7 件，写文案", calls: [{ tool: "write_copy", args: { sku: "SKU-89", copy: "春季新品 · 89 款 · 限量" } }] },
    { thought: "通知运营", calls: [{ tool: "notify_ops", args: { message: "上新：88/89 已写文案，90 缺货已记录" } }] },
    { thought: "汇总最终答案", calls: [] },
  ];

  const trajectory: Round[] = [];
  for (let i = 0; i < MOCK_TURNS.length; i++) {
    const tRound0 = Date.now();
    const turn = MOCK_TURNS[i];
    logger.info(
      "│ 调用循环-A-一步步走",
      `调用循环开始：第 ${i + 1} 圈 / 共 ${MOCK_TURNS.length} 圈`,
      "为什么写这条日志：一步步走每圈 Reason 后才决定这一刻调啥，不看未来。当前：第 N 圈 Reason 即将被模型（mock）回答。",
      { 入参: { round: i + 1 }, __code: `const turn = MOCK_TURNS[${i}];` },
    );

    const act = [];
    for (const call of turn.calls) {
      const tAct0 = Date.now();
      logger.info(
        "││ 调用函数-invokeTool",
        "调用函数开始：invokeTool",
        "为什么写这条日志：模型已经明确说要这个工具，不调就进不了下一圈。当前：第 N 圈 Reason 后。",
        { 入参: { call }, __code: `const r = invokeTool(${JSON.stringify(call)});` },
      );
      const r = invokeTool(call);
      logger.info(
        "││ 调用函数-invokeTool",
        "调用函数结束：invokeTool",
        `为什么写这条日志：要把结果交给「模型」看下一步。当前：tool=${call.tool} ok=${r.ok}。`,
        { 返回值: r, 耗时ms: Date.now() - tAct0 },
      );
      act.push(r);
    }

    const round: Round = {
      index: i + 1,
      reason: { tool_calls: turn.calls, thought: turn.thought },
      act,
      costMs: Date.now() - tRound0,
    };
    trajectory.push(round);

    logger.info(
      "│ 调用循环-A-一步步走",
      `调用循环结束：第 ${i + 1} 圈`,
      "为什么写这条日志：要把这一圈结果收口；下一步看 tool_calls 是不是空。",
      { 返回值: { round }, 耗时ms: Date.now() - tRound0 },
    );
  }

  const finalAnswer = "上新完成：SKU-88（12 件）/ SKU-89（7 件）已写文案，SKU-90 缺货已记录，运营已通知。";
  logger.info(
    "调用循环-A-一步步走",
    "调用循环结束：一步步走（变体 A · ReAct）",
    "为什么写这条日志：跑完收口；下一步回给浏览器左栏。",
    { 返回值: { rounds: trajectory.length, modelCalls: MOCK_TURNS.length, finalAnswer }, 耗时ms: Date.now() - t0 },
  );

  return {
    task,
    trajectory,
    summary: { rounds: trajectory.length, modelCalls: MOCK_TURNS.length, firstActIndex: 1 },
    finalAnswer,
  };
}
