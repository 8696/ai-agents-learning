/**
 * 本步核心（中栏）：智能体应用（Agent App）—— 同样的 while + 调大模型，但**对外只露最后一圈 + 一句给用户的回复**。
 *
 * 职责：调 runLoop({ exposeMessages: false })，把 messages 数组藏了不返 —— 模拟"产品在背后转了 N 圈，但 messages 列表归产品不归你"。
 *
 * 数据流：input.text → runLoop → 只返 { roundsHidden, finalReply, toolTrace }（messages 数组不返）。
 *
 * 为什么单独成文件：route 只做入参校验 + 调这一份；这是和左栏对照的核心 ——"调的是同一个 while，但展示不一样"。
 * 服务端日志里仍然有完整 messages（可去 logs/ 查）；API 不返 messages 是教学选择，不是技术限制。
 */
import { logger } from "../logger.js";
import { runLoop, type RunLoopOutput } from "./handwritten-loop.js";

export type AgentAppOutput = {
  /** 「产品内部转了几圈」—— 这一栏只露这个数字，不露 messages */
  roundsHidden: number;
  /** 给用户看的最终一句（这是产品\"推门递出来\"的那一句） */
  finalReply: string;
  /** 工具轨迹（不暴露 messages，但允许学习者看见工具发生了什么） */
  toolTrace: RunLoopOutput["toolTrace"];
  /** 这一栏调了几次模型（hidden 在 messages 数组里） */
  modelCalls: number;
  /** 闸门触发原因 */
  stoppedReason: "natural" | "maxRounds";
};

export async function runAsAgentApp(text: string, maxRounds: number): Promise<AgentAppOutput> {
  logger.info(
    "│ 调用函数-runAsAgentApp",
    "调用函数开始：runAsAgentApp",
    "为什么写这条日志：中栏（智能体应用）入口；调 runLoop 但 exposeMessages=false。messages 数组留在服务端日志里，不返给前端 —— 这就是\"产品在背后转圈你看不到圈\"的核心教学点。",
    {
      入参: { text, maxRounds },
      __code: "const out = await runAsAgentApp(text, maxRounds);",
    },
  );
  const t0 = Date.now();

  const inner = await runLoop({ text, exposeMessages: false, maxRounds });

  const out: AgentAppOutput = {
    roundsHidden: inner.rounds,
    finalReply: inner.finalReply,
    toolTrace: inner.toolTrace,
    modelCalls: inner.modelCalls,
    stoppedReason: inner.stoppedReason,
  };

  logger.info(
    "│ 调用函数-runAsAgentApp",
    "调用函数结束：runAsAgentApp",
    "为什么写这条日志：把 runLoop 的 messages 数组吃掉只露 rounds + finalReply；服务端日志里仍有完整 messages（去 logs/ 查）。当前：已经把 while 的产物只留最后一圈给前端。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}